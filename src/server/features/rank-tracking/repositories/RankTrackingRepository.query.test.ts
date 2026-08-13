import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { rankTrackingConfigs } from "@/db/schema";
import type * as RankTrackingRepositoryModule from "./RankTrackingRepository";

// Real in-memory SQLite so the due-query ordering, the manual-interval filter,
// and claimDueConfig's compare-and-set run against actual SQL — the parts the
// mocked service tests can't see.

vi.mock("cloudflare:workers", () => ({
  env: { DATABASE_PROVIDER: "d1" },
}));

let client: Client;
let testDb: ReturnType<typeof drizzle>;
let RankTrackingRepository: typeof RankTrackingRepositoryModule.RankTrackingRepository;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  testDb = drizzle(client);
  vi.doMock("@/db", () => ({ db: testDb }));

  await client.executeMultiple(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      name TEXT NOT NULL,
      domain TEXT,
      location_code INTEGER NOT NULL DEFAULT 2840,
      language_code TEXT NOT NULL DEFAULT 'en',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      archived_at TEXT
    );
    CREATE TABLE rank_tracking_configs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      domain TEXT NOT NULL,
      location_code INTEGER NOT NULL DEFAULT 2840,
      language_code TEXT NOT NULL DEFAULT 'en',
      devices TEXT NOT NULL DEFAULT 'both',
      serp_depth INTEGER NOT NULL,
      schedule_interval TEXT NOT NULL DEFAULT 'weekly',
      location_name TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      last_checked_at TEXT,
      next_check_at TEXT,
      last_skip_reason TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE rank_tracking_keywords (
      id TEXT PRIMARY KEY,
      config_id TEXT NOT NULL,
      keyword TEXT NOT NULL,
      search_volume INTEGER,
      keyword_difficulty INTEGER,
      cpc REAL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  ({ RankTrackingRepository } = await import("./RankTrackingRepository"));
});

afterAll(() => {
  client.close();
});

beforeEach(async () => {
  await client.executeMultiple(`
    DELETE FROM rank_tracking_keywords;
    DELETE FROM rank_tracking_configs;
    DELETE FROM projects;
  `);
});

const NOW = "2026-08-01T12:00:00.000Z";

async function seedProject(id: string, archivedAt: string | null = null) {
  await client.execute({
    sql: "INSERT INTO projects (id, organization_id, name, archived_at) VALUES (?, ?, ?, ?)",
    args: [id, `org_${id}`, id, archivedAt],
  });
}

async function seedConfig(input: {
  id: string;
  projectId?: string;
  nextCheckAt?: string | null;
  scheduleInterval?: string;
  isActive?: number;
  lastSkipReason?: string | null;
}) {
  await client.execute({
    sql: `INSERT INTO rank_tracking_configs
      (id, project_id, domain, serp_depth, schedule_interval, is_active, next_check_at, last_skip_reason)
      VALUES (?, ?, ?, 20, ?, ?, ?, ?)`,
    args: [
      input.id,
      input.projectId ?? "proj_1",
      `${input.id}.example.com`,
      input.scheduleInterval ?? "daily",
      input.isActive ?? 1,
      input.nextCheckAt === undefined
        ? "2026-07-01T05:00:00.000Z"
        : input.nextCheckAt,
      input.lastSkipReason ?? null,
    ],
  });
}

async function getConfigRow(id: string) {
  const rows = await testDb
    .select({
      nextCheckAt: rankTrackingConfigs.nextCheckAt,
      lastSkipReason: rankTrackingConfigs.lastSkipReason,
    })
    .from(rankTrackingConfigs)
    .where(eq(rankTrackingConfigs.id, id));
  return rows[0];
}

describe("getDueConfigsWithOrganization", () => {
  it("returns due rows oldest-first and excludes manual, inactive, future, and archived rows", async () => {
    await seedProject("proj_1");
    await seedProject("proj_archived", "2026-07-15T00:00:00.000Z");
    await seedConfig({
      id: "cfg_newer",
      nextCheckAt: "2026-07-02T05:00:00.000Z",
    });
    await seedConfig({
      id: "cfg_oldest",
      nextCheckAt: "2026-07-01T05:00:00.000Z",
    });
    // Same timestamp as cfg_oldest — id breaks the tie deterministically.
    await seedConfig({
      id: "cfg_tie",
      nextCheckAt: "2026-07-01T05:00:00.000Z",
    });
    await seedConfig({ id: "cfg_manual", scheduleInterval: "manual" });
    await seedConfig({ id: "cfg_inactive", isActive: 0 });
    await seedConfig({
      id: "cfg_future",
      nextCheckAt: "2027-01-01T05:00:00.000Z",
    });
    await seedConfig({ id: "cfg_null_due", nextCheckAt: null });
    await seedConfig({ id: "cfg_archived", projectId: "proj_archived" });

    const due = await RankTrackingRepository.getDueConfigsWithOrganization(NOW);

    expect(due.map((c) => c.id)).toEqual([
      "cfg_oldest",
      "cfg_tie",
      "cfg_newer",
    ]);
    expect(due[0].organizationId).toBe("org_proj_1");
  });
});

describe("claimDueConfig", () => {
  it("advances the schedule and writes the skip reason when the token matches", async () => {
    await seedProject("proj_1");
    await seedConfig({ id: "cfg_1", nextCheckAt: "2026-07-01T05:00:00.000Z" });

    const claimed = await RankTrackingRepository.claimDueConfig({
      configId: "cfg_1",
      projectId: "proj_1",
      observedNextCheckAt: "2026-07-01T05:00:00.000Z",
      nextCheckAt: "2026-08-02T05:00:00.000Z",
      lastSkipReason: "plan_required",
    });

    expect(claimed).toBe(true);
    expect(await getConfigRow("cfg_1")).toEqual({
      nextCheckAt: "2026-08-02T05:00:00.000Z",
      lastSkipReason: "plan_required",
    });
  });

  it("refuses when the observed token no longer matches, leaving the row untouched", async () => {
    await seedProject("proj_1");
    await seedConfig({
      id: "cfg_1",
      nextCheckAt: "2026-07-20T05:00:00.000Z",
      lastSkipReason: "insufficient_credits",
    });

    const claimed = await RankTrackingRepository.claimDueConfig({
      configId: "cfg_1",
      projectId: "proj_1",
      observedNextCheckAt: "2026-07-01T05:00:00.000Z",
      nextCheckAt: "2026-08-02T05:00:00.000Z",
      lastSkipReason: null,
    });

    expect(claimed).toBe(false);
    expect(await getConfigRow("cfg_1")).toEqual({
      nextCheckAt: "2026-07-20T05:00:00.000Z",
      lastSkipReason: "insufficient_credits",
    });
  });

  it("refuses deactivated rows and preserves the skip reason when omitted", async () => {
    await seedProject("proj_1");
    await seedConfig({ id: "cfg_off", isActive: 0 });
    await seedConfig({
      id: "cfg_restore",
      nextCheckAt: "2026-08-02T05:00:00.000Z",
      lastSkipReason: "insufficient_credits",
    });

    expect(
      await RankTrackingRepository.claimDueConfig({
        configId: "cfg_off",
        projectId: "proj_1",
        observedNextCheckAt: "2026-07-01T05:00:00.000Z",
        nextCheckAt: "2026-08-02T05:00:00.000Z",
      }),
    ).toBe(false);

    // Restore-shaped claim: no lastSkipReason key — the existing value stays.
    expect(
      await RankTrackingRepository.claimDueConfig({
        configId: "cfg_restore",
        projectId: "proj_1",
        observedNextCheckAt: "2026-08-02T05:00:00.000Z",
        nextCheckAt: "2026-07-01T05:00:00.000Z",
      }),
    ).toBe(true);
    expect(await getConfigRow("cfg_restore")).toEqual({
      nextCheckAt: "2026-07-01T05:00:00.000Z",
      lastSkipReason: "insufficient_credits",
    });
  });
});

describe("getKeywordCountsForConfigs", () => {
  it("groups counts by config and omits configs with no keywords", async () => {
    await seedProject("proj_1");
    await seedConfig({ id: "cfg_a" });
    await seedConfig({ id: "cfg_b" });
    for (const [id, configId] of [
      ["kw1", "cfg_a"],
      ["kw2", "cfg_a"],
      ["kw3", "cfg_b"],
    ] as const) {
      await client.execute({
        sql: "INSERT INTO rank_tracking_keywords (id, config_id, keyword) VALUES (?, ?, ?)",
        args: [id, configId, id],
      });
    }

    const counts = await RankTrackingRepository.getKeywordCountsForConfigs([
      "cfg_a",
      "cfg_b",
      "cfg_missing",
    ]);

    expect(counts).toEqual(
      new Map([
        ["cfg_a", 2],
        ["cfg_b", 1],
      ]),
    );
    expect(await RankTrackingRepository.getKeywordCountsForConfigs([])).toEqual(
      new Map(),
    );
  });
});
