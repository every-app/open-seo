import { readFileSync } from "node:fs";
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
import { UmamiError } from "@/server/lib/umamiErrors";
import type * as UmamiServiceModule from "./UmamiService";

// Real in-memory SQLite running the shipped migration, so organization
// scoping and the encrypted columns are checked against actual SQL.

const mocks = vi.hoisted(() => ({
  listWebsites: vi.fn(),
  getWebsite: vi.fn(),
  getStats: vi.fn(),
  createUmamiClient: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: vi
    .fn()
    .mockResolvedValue("test-secret-that-is-at-least-32-chars"),
}));
vi.mock("@/server/lib/umamiClient", () => ({
  createUmamiClient: mocks.createUmamiClient,
}));

let client: Client;
let UmamiService: typeof UmamiServiceModule.UmamiService;

async function rows(sql: string) {
  return (await client.execute(sql)).rows;
}

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  // testDb only exists at runtime, so the module under test must load after
  // these mocks — the doMock + dynamic import pattern workspace-merge uses.
  vi.doMock("@/db", () => ({ db: testDb }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: testDb }));
  vi.doMock("@/db/pg/client", () => ({ pgDb: null }));

  await client.executeMultiple(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE organization (id TEXT PRIMARY KEY);
    CREATE TABLE projects (id TEXT PRIMARY KEY);
  `);
  const migration = readFileSync(
    join(process.cwd(), "drizzle/sqlite/0062_umami_connections.sql"),
    "utf8",
  );
  await client.executeMultiple(
    migration.replaceAll("--> statement-breakpoint", ""),
  );

  ({ UmamiService } = await import("./UmamiService"));
});

afterAll(() => client.close());

const login = {
  organizationId: "org_a",
  userId: "user_1",
  baseUrl: "stats.example.com/",
  authType: "password" as const,
  username: "viewer",
  secret: "hunter2",
  headers: [{ name: "CF-Access-Client-Secret", value: "proxy-secret" }],
};

describe("UmamiService", () => {
  beforeEach(async () => {
    await client.executeMultiple(`
      DELETE FROM umami_connections;
      DELETE FROM umami_instances;
      DELETE FROM projects;
      DELETE FROM organization;
      INSERT INTO organization (id) VALUES ('org_a'), ('org_b');
      INSERT INTO projects (id) VALUES ('project_a'), ('project_b');
    `);
    mocks.createUmamiClient.mockReturnValue({
      listWebsites: mocks.listWebsites,
      getWebsite: mocks.getWebsite,
      getStats: mocks.getStats,
    });
    mocks.listWebsites.mockResolvedValue([{ id: "w1", name: "Site" }]);
    mocks.getWebsite.mockResolvedValue({
      id: "w1",
      name: "Site",
      domain: "a.com",
    });
    mocks.getStats.mockResolvedValue({});
  });

  it("stores nothing when the Umami server rejects the login", async () => {
    mocks.listWebsites.mockRejectedValue(
      new UmamiError("umami_auth_failed", "Umami rejected the password."),
    );

    await expect(UmamiService.saveInstance(login)).resolves.toEqual({
      problem: {
        code: "umami_auth_failed",
        message: "Umami rejected the password.",
      },
    });
    expect(await rows("SELECT id FROM umami_instances")).toEqual([]);
  });

  it("encrypts the password and proxy headers at rest and decrypts them for reports", async () => {
    const saved = await UmamiService.saveInstance(login);
    if (!("instance" in saved)) throw new Error("expected a saved login");

    expect(saved.instance).toEqual(
      expect.objectContaining({
        baseUrl: "https://stats.example.com",
        username: "viewer",
        hasCustomHeaders: true,
      }),
    );
    expect(JSON.stringify(saved)).not.toContain("hunter2");
    const [stored] = await rows(
      "SELECT encrypted_secret, encrypted_headers FROM umami_instances",
    );
    expect(stored.encrypted_secret).toEqual(expect.any(String));
    expect(stored.encrypted_headers).toEqual(expect.any(String));
    expect(JSON.stringify(stored)).not.toMatch(/hunter2|proxy-secret/);

    await UmamiService.setWebsite({
      projectId: "project_a",
      organizationId: "org_a",
      userId: "user_1",
      instanceId: saved.instance.id,
      websiteId: "w1",
      timeZone: "Asia/Bangkok",
    });
    await UmamiService.openConnection("project_a");
    expect(mocks.createUmamiClient).toHaveBeenLastCalledWith({
      baseUrl: "https://stats.example.com",
      authType: "password",
      username: "viewer",
      secret: "hunter2",
      headers: login.headers,
    });
  });

  it("updates a re-saved login instead of adding a second copy", async () => {
    await UmamiService.saveInstance(login);
    await UmamiService.saveInstance({
      ...login,
      userId: "user_2",
      secret: "rotated",
    });

    // The row now holds user_2's secret, so it belongs to user_2 for erasure.
    expect(await rows("SELECT saved_by_user_id FROM umami_instances")).toEqual([
      expect.objectContaining({ saved_by_user_id: "user_2" }),
    ]);
  });

  it("won't read or bind another organization's login", async () => {
    const saved = await UmamiService.saveInstance(login);
    if (!("instance" in saved)) throw new Error("expected a saved login");
    const instanceId = saved.instance.id;

    await expect(
      UmamiService.listWebsites({ organizationId: "org_b", instanceId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      UmamiService.setWebsite({
        projectId: "project_b",
        organizationId: "org_b",
        userId: "user_2",
        instanceId,
        websiteId: "w1",
        timeZone: "UTC",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await rows("SELECT id FROM umami_connections")).toEqual([]);
  });
});
