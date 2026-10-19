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
import type * as DeleteConfigCascadeModule from "./deleteConfigCascade";

// Real in-memory SQLite so the due-query ordering, the manual-interval filter,
// and claimDueConfig's compare-and-set run against actual SQL — the parts the
// mocked service tests can't see.

vi.mock("cloudflare:workers", () => ({
  env: { DATABASE_PROVIDER: "d1" },
}));

let client: Client;
let testDb: ReturnType<typeof drizzle>;
let RankTrackingRepository: typeof RankTrackingRepositoryModule.RankTrackingRepository;
let deleteConfigCascade: typeof DeleteConfigCascadeModule.deleteConfigCascade;

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
      pinned_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE rank_check_runs (
      id TEXT PRIMARY KEY,
      config_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      keywords_total INTEGER NOT NULL DEFAULT 0,
      keywords_checked INTEGER NOT NULL DEFAULT 0,
      is_subset_run INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT
    );
    CREATE TABLE rank_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      tracking_keyword_id TEXT NOT NULL,
      keyword TEXT NOT NULL,
      device TEXT NOT NULL,
      position INTEGER,
      url TEXT,
      serp_features TEXT,
      checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // No FK clauses above — deliberate. deleteConfigCascade must remove children
  // itself; this harness would keep orphans alive if it leaned on cascades.
  // Production runBatch targets the real d1/pg clients, not the mocked "@/db",
  // so route its batched statements at the in-memory db too.
  vi.doMock("@/db/runBatch", () => ({
    DB_BATCH_SIZE: 100,
    runBatch: async (build: (tx: unknown) => readonly Promise<unknown>[]) => {
      for (const statement of build(testDb)) await statement;
    },
    executeInBatches: async (
      items: unknown[],
      buildStatement: (tx: unknown, item: unknown) => Promise<unknown>,
    ) => {
      for (const item of items) await buildStatement(testDb, item);
    },
  }));

  ({ RankTrackingRepository } = await import("./RankTrackingRepository"));
  ({ deleteConfigCascade } = await import("./deleteConfigCascade"));
});

afterAll(() => {
  client.close();
});

beforeEach(async () => {
  await client.executeMultiple(`
    DELETE FROM rank_snapshots;
    DELETE FROM rank_check_runs;
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

describe("deleteConfigCascade", () => {
  it("removes the config with its keywords, runs, and snapshots, leaving other configs intact", async () => {
    await seedProject("proj_1");
    await seedConfig({ id: "cfg_doomed" });
    await seedConfig({ id: "cfg_kept" });
    await client.executeMultiple(`
      INSERT INTO rank_tracking_keywords (id, config_id, keyword) VALUES
        ('kw_doomed', 'cfg_doomed', 'doomed kw'),
        ('kw_kept', 'cfg_kept', 'kept kw');
      INSERT INTO rank_check_runs (id, config_id, project_id, status) VALUES
        ('run_doomed', 'cfg_doomed', 'proj_1', 'completed'),
        ('run_kept', 'cfg_kept', 'proj_1', 'completed');
      INSERT INTO rank_snapshots (run_id, tracking_keyword_id, keyword, device) VALUES
        ('run_doomed', 'kw_doomed', 'doomed kw', 'desktop'),
        ('run_kept', 'kw_kept', 'kept kw', 'desktop');
    `);

    await deleteConfigCascade("cfg_doomed");

    const remaining = async (sql: string) =>
      (await client.execute(sql)).rows.map((row) => row[0]);
    expect(await remaining("SELECT id FROM rank_tracking_configs")).toEqual([
      "cfg_kept",
    ]);
    expect(await remaining("SELECT id FROM rank_tracking_keywords")).toEqual([
      "kw_kept",
    ]);
    expect(await remaining("SELECT id FROM rank_check_runs")).toEqual([
      "run_kept",
    ]);
    expect(await remaining("SELECT run_id FROM rank_snapshots")).toEqual([
      "run_kept",
    ]);
  });
});

describe("setKeywordsPinned", () => {
  it("pins and unpins only keywords of the given config", async () => {
    await seedProject("proj_1");
    await seedConfig({ id: "cfg_a" });
    await seedConfig({ id: "cfg_b" });
    for (const [id, configId] of [
      ["kw1", "cfg_a"],
      ["kw2", "cfg_b"],
    ] as const) {
      await client.execute({
        sql: "INSERT INTO rank_tracking_keywords (id, config_id, keyword) VALUES (?, ?, ?)",
        args: [id, configId, id],
      });
    }
    const pinnedIds = async () =>
      (
        await client.execute(
          "SELECT id FROM rank_tracking_keywords WHERE pinned_at IS NOT NULL",
        )
      ).rows.map((row) => row.id);

    // kw2 belongs to another config, so the config predicate skips it.
    expect(
      await RankTrackingRepository.setKeywordsPinned(
        ["kw1", "kw2"],
        "cfg_a",
        true,
      ),
    ).toEqual(["kw1"]);
    expect(await pinnedIds()).toEqual(["kw1"]);

    await RankTrackingRepository.setKeywordsPinned(["kw1"], "cfg_a", false);
    expect(await pinnedIds()).toEqual([]);
  });
});

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
}

describe("getConfigTrend", () => {
  it("keeps every row of a run inside the range and drops a run that started before it", async () => {
    // run_b started before the 30-day cutoff, but one snapshot is after it.
    for (const [runId, startedAt, snapshotTimes] of [
      ["run_a", daysAgo(10), [daysAgo(10), daysAgo(10)]],
      ["run_b", daysAgo(30.01), [daysAgo(30.01), daysAgo(29.99)]],
    ] as const) {
      await client.execute({
        sql: "INSERT INTO rank_check_runs (id, config_id, project_id, status, keywords_total, started_at) VALUES (?, 'cfg_a', 'proj_1', 'completed', 2, ?)",
        args: [runId, startedAt],
      });
      for (const [index, checkedAt] of snapshotTimes.entries()) {
        await client.execute({
          sql: "INSERT INTO rank_snapshots (run_id, tracking_keyword_id, keyword, device, position, checked_at) VALUES (?, ?, 'kw', 'desktop', 5, ?)",
          args: [runId, `kw${index}`, checkedAt],
        });
      }
    }

    const trend = await RankTrackingRepository.getConfigTrend(
      "cfg_a",
      "desktop",
      30,
    );

    expect(trend).toMatchObject([
      { runId: "run_a", keywordsTotal: 2, total: 2 },
    ]);
  });
});
