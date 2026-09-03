import { readFileSync } from "node:fs";
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
import type * as ClarityRepositoryModule from "@/server/features/clarity/repositories/ClarityRepository";

vi.mock("cloudflare:workers", () => ({
  env: { DATABASE_PROVIDER: "d1" },
}));

let client: Client;
let ClarityRepository: typeof ClarityRepositoryModule.ClarityRepository;

async function rows(sql: string) {
  return (await client.execute(sql)).rows;
}

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  vi.doMock("@/db", () => ({ db: testDb }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: testDb }));
  vi.doMock("@/db/pg/client", () => ({ pgDb: null }));

  await client.executeMultiple(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE organization (id TEXT PRIMARY KEY);
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE
    );
    ${readFileSync("drizzle/0045_cloudy_banshee.sql", "utf8").replaceAll("--> statement-breakpoint", "")}
    INSERT INTO organization (id) VALUES ('organization-1');
    INSERT INTO projects (id, organization_id) VALUES ('project-1', 'organization-1');
  `);

  ({ ClarityRepository } = await import("./ClarityRepository"));
});

afterAll(() => {
  client.close();
});

beforeEach(async () => {
  await client.executeMultiple(`
    DELETE FROM clarity_report_refresh_leases;
    DELETE FROM clarity_report_cache;
    DELETE FROM clarity_connections;
  `);
});

describe("ClarityRepository", () => {
  it("stores encrypted connection material and its validated overview", async () => {
    await ClarityRepository.upsertConnectionWithOverview({
      projectId: "project-1",
      organizationId: "organization-1",
      encryptedApiToken: "ciphertext-only",
      tokenHint: "••••last",
      connectedByUserId: "user-1",
      responseJson: '[{"metricName":"Traffic","information":[]}]',
      fetchedAt: "2026-09-03T12:00:00.000Z",
    });

    expect(
      await rows(
        "SELECT project_id, encrypted_api_token, token_hint, created_at FROM clarity_connections",
      ),
    ).toEqual([
      expect.objectContaining({
        project_id: "project-1",
        encrypted_api_token: "ciphertext-only",
        token_hint: "••••last",
        created_at: "2026-09-03T12:00:00.000Z",
      }),
    ]);
    expect(
      await rows(
        "SELECT report_kind, num_of_days, fetched_at FROM clarity_report_cache",
      ),
    ).toEqual([
      expect.objectContaining({
        report_kind: "overview",
        num_of_days: 3,
        fetched_at: "2026-09-03T12:00:00.000Z",
      }),
    ]);
  });

  it("clears every old report atomically when the token is replaced", async () => {
    await ClarityRepository.upsertConnectionWithOverview({
      projectId: "project-1",
      organizationId: "organization-1",
      encryptedApiToken: "old-ciphertext",
      tokenHint: "••••old1",
      connectedByUserId: "user-1",
      responseJson: '[{"metricName":"Old","information":[]}]',
      fetchedAt: "2026-09-01T00:00:00.000Z",
    });
    const oldConnection =
      await ClarityRepository.getConnectionByProjectId("project-1");
    expect(oldConnection).not.toBeNull();
    await ClarityRepository.upsertCachedReportIfCurrent({
      projectId: "project-1",
      reportKind: "url",
      numOfDays: 3,
      connectionId: oldConnection!.id,
      responseJson: '[{"metricName":"Old URL","information":[]}]',
      fetchedAt: "2026-09-01T00:00:00.000Z",
    });

    await ClarityRepository.upsertConnectionWithOverview({
      projectId: "project-1",
      organizationId: "organization-1",
      encryptedApiToken: "new-ciphertext",
      tokenHint: "••••new1",
      connectedByUserId: "user-2",
      responseJson: '[{"metricName":"New","information":[]}]',
      fetchedAt: "2026-09-03T00:00:00.000Z",
    });

    expect(
      await rows(
        "SELECT report_kind, response_json FROM clarity_report_cache ORDER BY report_kind",
      ),
    ).toEqual([
      expect.objectContaining({
        report_kind: "overview",
        response_json: '[{"metricName":"New","information":[]}]',
      }),
    ]);
    expect(
      await rows(
        "SELECT encrypted_api_token, token_hint, connected_by_user_id FROM clarity_connections",
      ),
    ).toEqual([
      expect.objectContaining({
        encrypted_api_token: "new-ciphertext",
        token_hint: "••••new1",
        connected_by_user_id: "user-2",
      }),
    ]);
  });

  it("rejects an in-flight cache write after the token is replaced", async () => {
    await ClarityRepository.upsertConnectionWithOverview({
      projectId: "project-1",
      organizationId: "organization-1",
      encryptedApiToken: "old-ciphertext",
      tokenHint: "••••old1",
      connectedByUserId: "user-1",
      responseJson: '[{"metricName":"Old","information":[]}]',
      fetchedAt: "2026-09-01T00:00:00.000Z",
    });
    const oldConnection =
      await ClarityRepository.getConnectionByProjectId("project-1");
    expect(oldConnection).not.toBeNull();

    await ClarityRepository.upsertConnectionWithOverview({
      projectId: "project-1",
      organizationId: "organization-1",
      encryptedApiToken: "new-ciphertext",
      tokenHint: "••••new1",
      connectedByUserId: "user-2",
      responseJson: '[{"metricName":"New","information":[]}]',
      fetchedAt: "2026-09-03T00:00:00.000Z",
    });

    await expect(
      ClarityRepository.upsertCachedReportIfCurrent({
        projectId: "project-1",
        reportKind: "url",
        numOfDays: 3,
        connectionId: oldConnection!.id,
        responseJson: '[{"metricName":"Old URL","information":[]}]',
        fetchedAt: "2026-09-03T00:00:01.000Z",
      }),
    ).resolves.toBe(false);
    expect(
      await rows(
        "SELECT report_kind, response_json FROM clarity_report_cache ORDER BY report_kind",
      ),
    ).toEqual([
      expect.objectContaining({
        report_kind: "overview",
        response_json: '[{"metricName":"New","information":[]}]',
      }),
    ]);
  });

  it("grants only one refresh lease for the same report generation", async () => {
    await ClarityRepository.upsertConnectionWithOverview({
      projectId: "project-1",
      organizationId: "organization-1",
      encryptedApiToken: "ciphertext-only",
      tokenHint: "••••last",
      connectedByUserId: "user-1",
      responseJson: "[]",
      fetchedAt: "2026-09-03T00:00:00.000Z",
    });
    const connection =
      await ClarityRepository.getConnectionByProjectId("project-1");
    expect(connection).not.toBeNull();
    const identity = {
      projectId: "project-1",
      reportKind: "url",
      numOfDays: 3,
      connectionId: connection!.id,
      now: "2026-09-03T00:00:00.000Z",
      expiresAt: "2026-09-03T00:00:20.000Z",
    };

    const first = await ClarityRepository.claimReportRefresh(identity);
    const second = await ClarityRepository.claimReportRefresh(identity);

    expect(first).toEqual(expect.any(String));
    expect(second).toBeNull();
    expect(
      await ClarityRepository.hasActiveReportRefresh({
        ...identity,
        now: "2026-09-03T00:00:01.000Z",
      }),
    ).toBe(true);
    await ClarityRepository.releaseReportRefresh({
      ...identity,
      leaseId: first!,
    });
    await expect(
      ClarityRepository.claimReportRefresh(identity),
    ).resolves.toEqual(expect.any(String));
  });

  it("deletes connection and cached reports together", async () => {
    await ClarityRepository.upsertConnectionWithOverview({
      projectId: "project-1",
      organizationId: "organization-1",
      encryptedApiToken: "ciphertext-only",
      tokenHint: "••••last",
      connectedByUserId: "user-1",
      responseJson: "[]",
      fetchedAt: "2026-09-03T12:00:00.000Z",
    });

    await ClarityRepository.disconnect("project-1");

    expect(await rows("SELECT * FROM clarity_connections")).toEqual([]);
    expect(await rows("SELECT * FROM clarity_report_cache")).toEqual([]);
    expect(await rows("SELECT * FROM clarity_report_refresh_leases")).toEqual(
      [],
    );
  });
});
