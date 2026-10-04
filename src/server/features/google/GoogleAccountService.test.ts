import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { runBatch } from "@/db/runBatch";
import type * as ServiceModule from "./GoogleAccountService";

vi.mock("cloudflare:workers", () => ({ env: {} }));
let client: Client;
const directory = mkdtempSync(join(tmpdir(), "google-account-removal-"));
let service: typeof ServiceModule.GoogleAccountService;
type Build = Parameters<typeof runBatch>[0];

beforeAll(async () => {
  client = createClient({ url: `file:${join(directory, "test.db")}` });
  const testDb = drizzle(client);
  vi.doMock("@/db", () => ({ db: testDb }));
  vi.doMock("@/db/runBatch", () => ({
    runBatch: async (build: Build) => {
      await testDb.transaction(async (tx) => {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- real SQLite Drizzle executor has the same query-builder surface
        for (const statement of build(tx as unknown as Parameters<Build>[0]))
          await statement;
      });
    },
  }));
  await client.executeMultiple(`
    CREATE TABLE user (id text PRIMARY KEY);
    CREATE TABLE organization (id text PRIMARY KEY);
    CREATE TABLE projects (id text PRIMARY KEY, archived integer DEFAULT 0);
    INSERT INTO user VALUES ('u1'), ('u2');
    INSERT INTO organization VALUES ('org1'), ('org2');
    INSERT INTO projects (id, archived) VALUES ('p1',0), ('p2',1), ('p3',0), ('p4',0);
  `);
  const authMigration = readFileSync(
    "drizzle/sqlite/0003_light_sage.sql",
    "utf8",
  ).split("--> statement-breakpoint");
  await client.executeMultiple(
    authMigration
      .filter(
        (sql) =>
          sql.includes("CREATE TABLE `account`") ||
          sql.includes("CREATE INDEX `account_userId_idx`"),
      )
      .join("\n"),
  );
  for (const file of [
    "drizzle/sqlite/0019_true_absorbing_man.sql",
    "drizzle/sqlite/0039_ga4_connections.sql",
  ]) {
    await client.executeMultiple(
      readFileSync(file, "utf8")
        .split("--> statement-breakpoint")
        .filter((sql) => !sql.includes("ALTER TABLE"))
        .join("\n"),
    );
  }
  await client.execute("ALTER TABLE gsc_connections ADD gsc_account_id text");
  ({ GoogleAccountService: service } = await import("./GoogleAccountService"));
});

afterAll(async () => {
  await client.close();
  rmSync(directory, { recursive: true });
});
beforeEach(async () => {
  await client.executeMultiple(
    "DROP TRIGGER IF EXISTS fail_remove; DELETE FROM gsc_connections; DELETE FROM ga4_connections; DELETE FROM account;",
  );
});

async function grant(provider: string, accountId = "google-a", userId = "u1") {
  await client.execute({
    sql: "INSERT INTO account (id, account_id, provider_id, user_id, updated_at, access_token, refresh_token) VALUES (?, ?, ?, ?, 1, 'access', 'refresh')",
    args: [`${provider}-${userId}-${accountId}`, accountId, provider, userId],
  });
}
async function mapping(
  provider: "gsc" | "ga4",
  projectId: string,
  accountId: string | null = "google-a",
  userId = "u1",
) {
  if (provider === "gsc")
    await client.execute({
      sql: "INSERT INTO gsc_connections (id, project_id, organization_id, site_url, connected_by_user_id, gsc_account_id) VALUES (?, ?, ?, 'https://example.com/', ?, ?)",
      args: [
        projectId,
        projectId,
        projectId === "p2" ? "org2" : "org1",
        userId,
        accountId,
      ],
    });
  else
    await client.execute({
      sql: "INSERT INTO ga4_connections (id, project_id, organization_id, property_id, property_display_name, property_time_zone, property_currency_code, connected_by_user_id, ga4_account_id) VALUES (?, ?, ?, 'properties/123', 'Example', 'UTC', 'USD', ?, ?)",
      args: [
        projectId,
        projectId,
        projectId === "p2" ? "org2" : "org1",
        userId,
        accountId,
      ],
    });
}
async function rows(table: "account" | "gsc_connections" | "ga4_connections") {
  return (await client.execute(`SELECT * FROM ${table} ORDER BY id`)).rows;
}

for (const provider of ["gsc", "ga4"] as const) {
  describe(`${provider} Google account removal`, () => {
    const providerId =
      provider === "gsc" ? "google-search-console" : "google-analytics";
    const otherId =
      provider === "gsc" ? "google-analytics" : "google-search-console";
    const table = provider === "gsc" ? "gsc_connections" : "ga4_connections";
    const input = { provider, accountId: "google-a", userId: "u1" };

    it("removes all dependent mappings including archived and other-workspace projects", async () => {
      await grant(providerId);
      await mapping(provider, "p1");
      await mapping(provider, "p2");
      expect(await service.getRemovalImpact(input)).toEqual({
        projectCount: 2,
      });
      await service.remove(input);
      expect(await rows(table)).toEqual([]);
      expect(await rows("account")).toEqual([]);
    });

    it("preserves other accounts, the other integration, and Google sign-in", async () => {
      await grant(providerId);
      await grant(providerId, "google-b");
      await grant(otherId);
      await grant("google");
      await mapping(provider, "p1");
      await mapping(provider, "p3", "google-b");
      await mapping(provider === "gsc" ? "ga4" : "gsc", "p4");
      await service.remove(input);
      expect(await rows("account")).toHaveLength(3);
      expect((await rows(table)).map((row) => row.project_id)).toEqual(["p3"]);
      expect(
        await rows(provider === "gsc" ? "ga4_connections" : "gsc_connections"),
      ).toHaveLength(1);
    });

    it("cannot remove another user's grant or project mappings", async () => {
      await grant(providerId);
      await mapping(provider, "p1");
      expect(
        await service.getRemovalImpact({ ...input, userId: "u2" }),
      ).toEqual({ projectCount: 0 });
      await service.remove({ ...input, userId: "u2" });
      expect(await rows("account")).toHaveLength(1);
      expect(await rows(table)).toHaveLength(1);
    });

    it("rolls project deletion back if deleting the authorization fails", async () => {
      await grant(providerId);
      await mapping(provider, "p1");
      await client.execute(
        "CREATE TRIGGER fail_remove BEFORE DELETE ON account BEGIN SELECT RAISE(ABORT, 'test failure'); END",
      );
      await expect(service.remove(input)).rejects.toThrow();
      expect(await rows(table)).toHaveLength(1);
      expect(await rows("account")).toHaveLength(1);
    });
  });
}

it("includes legacy GSC mappings in removal without touching another user's legacy mappings", async () => {
  await grant("google-search-console");
  await mapping("gsc", "p1", null);
  await mapping("gsc", "p2", null, "u2");
  const input = {
    provider: "gsc" as const,
    accountId: "google-a",
    userId: "u1",
  };
  expect((await service.getRemovalImpact(input)).projectCount).toBe(1);
  await service.remove(input);
  expect((await rows("gsc_connections")).map((row) => row.project_id)).toEqual([
    "p2",
  ]);
});

it.each(["same-account", "other-account", "other-user"] as const)(
  "GA4 preserves a missing email only for the same connection identity: %s",
  async (change) => {
    const { Ga4ConnectionRepository } =
      await import("@/server/features/ga4/repositories/Ga4ConnectionRepository");
    const base = {
      projectId: "p1",
      organizationId: "org1",
      propertyId: "properties/11",
      propertyDisplayName: "Site",
      propertyTimeZone: "America/New_York",
      propertyCurrencyCode: "USD",
      connectedByUserId: "u1",
      ga4AccountId: "google-a",
      connectedAccountEmail: "old@example.com",
    };
    await Ga4ConnectionRepository.upsert(base);
    const saved = await Ga4ConnectionRepository.upsert({
      ...base,
      connectedByUserId: change === "other-user" ? "u2" : "u1",
      ga4AccountId: change === "other-account" ? "google-b" : "google-a",
      connectedAccountEmail: null,
    });
    expect(saved.connectedAccountEmail).toBe(
      change === "same-account" ? "old@example.com" : null,
    );
  },
);

it.each(["same-account", "other-account", "other-user"] as const)(
  "GSC preserves a missing email only for the same connection identity: %s",
  async (change) => {
    const { GscConnectionRepository } =
      await import("@/server/features/gsc/repositories/GscConnectionRepository");
    const base = {
      projectId: "p1",
      organizationId: "org1",
      siteUrl: "https://example.com/",
      connectedByUserId: "u1",
      gscAccountId: "google-a",
      connectedAccountEmail: "old@example.com",
    };
    await GscConnectionRepository.upsert(base);
    const connectedByUserId = change === "other-user" ? "u2" : "u1";
    const gscAccountId = change === "other-account" ? "google-b" : "google-a";
    const saved = await GscConnectionRepository.upsert({
      ...base,
      connectedByUserId,
      gscAccountId,
      connectedAccountEmail: null,
    });
    expect(saved.connectedAccountEmail).toBe(
      change === "same-account" ? "old@example.com" : null,
    );
  },
);
