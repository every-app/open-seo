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
import type * as RankTrackingRepositoryModule from "./RankTrackingRepository";

// Real in-memory SQLite so range filtering, ordering, and pagination of the
// rank-history reads run against actual SQL. Self-contained harness (the
// sibling query.test.ts covers scheduling paths) — the max-lines lint caps
// test files too, so these get their own file.

vi.mock("cloudflare:workers", () => ({
  env: { DATABASE_PROVIDER: "d1" },
}));

let client: Client;
let RankTrackingRepository: typeof RankTrackingRepositoryModule.RankTrackingRepository;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  vi.doMock("@/db", () => ({ db: testDb }));

  await client.executeMultiple(`
    CREATE TABLE rank_tracking_configs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      domain TEXT NOT NULL,
      location_code INTEGER NOT NULL DEFAULT 2840,
      language_code TEXT NOT NULL DEFAULT 'en',
      serp_depth INTEGER NOT NULL DEFAULT 20,
      schedule_interval TEXT NOT NULL DEFAULT 'weekly'
    );
    CREATE TABLE rank_check_runs (
      id TEXT PRIMARY KEY,
      config_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      keywords_total INTEGER NOT NULL DEFAULT 0,
      keywords_checked INTEGER NOT NULL DEFAULT 0,
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

  ({ RankTrackingRepository } = await import("./RankTrackingRepository"));
});

afterAll(() => {
  client.close();
});

beforeEach(async () => {
  await client.executeMultiple(`
    DELETE FROM rank_snapshots;
    DELETE FROM rank_check_runs;
    DELETE FROM rank_tracking_configs;
  `);
});

async function seedConfig(id: string) {
  await client.execute({
    sql: "INSERT INTO rank_tracking_configs (id, project_id, domain) VALUES (?, 'proj_1', ?)",
    args: [id, `${id}.example.com`],
  });
}

async function seedRun(input: {
  id: string;
  configId: string;
  status?: string;
  errorMessage?: string | null;
  keywordsChecked?: number;
  keywordsTotal?: number;
  startedAt: string;
  completedAt?: string | null;
}) {
  await client.execute({
    sql: `INSERT INTO rank_check_runs
      (id, config_id, project_id, status, keywords_total, keywords_checked, error_message, started_at, completed_at)
      VALUES (?, ?, 'proj_1', ?, ?, ?, ?, ?, ?)`,
    args: [
      input.id,
      input.configId,
      input.status ?? "completed",
      input.keywordsTotal ?? 2,
      input.keywordsChecked ?? 2,
      input.errorMessage ?? null,
      input.startedAt,
      input.completedAt ?? null,
    ],
  });
}

async function seedSnapshot(input: {
  runId: string;
  keyword: string;
  device?: string;
  position?: number | null;
  url?: string | null;
  checkedAt: string;
}) {
  await client.execute({
    sql: `INSERT INTO rank_snapshots
      (run_id, tracking_keyword_id, keyword, device, position, url, checked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      input.runId,
      `kw_${input.keyword}`,
      input.keyword,
      input.device ?? "desktop",
      input.position ?? null,
      input.url ?? null,
      input.checkedAt,
    ],
  });
}

describe("getSnapshotsInRange", () => {
  it("returns checks inside the range with run context, keeping null positions", async () => {
    await seedConfig("cfg_1");
    await seedRun({
      id: "run_old",
      configId: "cfg_1",
      startedAt: "2026-09-28 03:00:00",
      completedAt: "2026-09-28 03:05:00",
    });
    await seedRun({
      id: "run_new",
      configId: "cfg_1",
      startedAt: "2026-10-01 03:00:00",
      completedAt: "2026-10-01 03:05:00",
    });
    await seedSnapshot({
      runId: "run_old",
      keyword: "seo tools",
      position: 12,
      url: "https://example.com/a",
      checkedAt: "2026-09-28 03:01:00",
    });
    await seedSnapshot({
      runId: "run_new",
      keyword: "seo tools",
      position: 9,
      url: "https://example.com/a",
      checkedAt: "2026-10-01 03:01:00",
    });
    await seedSnapshot({
      runId: "run_new",
      keyword: "seo tools",
      device: "mobile",
      position: null, // not found inside the tracked depth — a result, not a failure
      checkedAt: "2026-10-01 03:01:30",
    });

    const out = await RankTrackingRepository.getSnapshotsInRange({
      configId: "cfg_1",
      startCheckedAt: "2026-09-30 00:00:00",
      endCheckedAt: "2026-10-03 23:59:59",
      limit: 100,
      offset: 0,
    });

    expect(out.totalCount).toBe(2);
    expect(out.rows[0]).toMatchObject({
      keyword: "seo tools",
      device: "mobile",
      position: null,
      runId: "run_new",
      runStatus: "completed",
    });
    expect(out.rows[1]).toMatchObject({ position: 9, runId: "run_new" });
  });

  it("pages with limit/offset over a stable newest-first order", async () => {
    await seedConfig("cfg_1");
    await seedRun({
      id: "run_1",
      configId: "cfg_1",
      startedAt: "2026-10-01 03:00:00",
      completedAt: "2026-10-01 03:05:00",
    });
    for (const [i, keyword] of ["a", "b", "c"].entries()) {
      await seedSnapshot({
        runId: "run_1",
        keyword,
        position: i + 1,
        checkedAt: "2026-10-01 03:01:00",
      });
    }

    const page1 = await RankTrackingRepository.getSnapshotsInRange({
      configId: "cfg_1",
      limit: 2,
      offset: 0,
    });
    const page2 = await RankTrackingRepository.getSnapshotsInRange({
      configId: "cfg_1",
      limit: 2,
      offset: 2,
    });

    expect(page1.totalCount).toBe(3);
    expect(page2.rows).toHaveLength(1);
    expect([...page1.rows, ...page2.rows].map((r) => r.keyword)).toEqual([
      "c",
      "b",
      "a",
    ]);
  });
});

describe("getRunsInRange", () => {
  it("keeps a fully-failed run visible even though it wrote no checks", async () => {
    await seedConfig("cfg_1");
    await seedRun({
      id: "run_ok",
      configId: "cfg_1",
      startedAt: "2026-10-01 03:00:00",
      completedAt: "2026-10-01 03:05:00",
    });
    await seedRun({
      id: "run_bad",
      configId: "cfg_1",
      status: "failed",
      errorMessage: "Insufficient credits",
      keywordsChecked: 0,
      startedAt: "2026-10-02 03:00:00",
    });
    await seedSnapshot({
      runId: "run_ok",
      keyword: "seo tools",
      position: 12,
      checkedAt: "2026-10-01 03:01:00",
    });

    const runs = await RankTrackingRepository.getRunsInRange({
      configId: "cfg_1",
    });
    const checks = await RankTrackingRepository.getSnapshotsInRange({
      configId: "cfg_1",
      limit: 100,
      offset: 0,
    });

    expect(runs.map((r) => r.id)).toEqual(["run_bad", "run_ok"]);
    expect(runs[0]).toMatchObject({
      status: "failed",
      errorMessage: "Insufficient credits",
      keywordsChecked: 0,
    });
    expect(checks.totalCount).toBe(1);
  });

  it("scopes by startedAt bounds", async () => {
    await seedConfig("cfg_1");
    await seedRun({
      id: "run_old",
      configId: "cfg_1",
      startedAt: "2026-09-01 03:00:00",
    });
    await seedRun({
      id: "run_new",
      configId: "cfg_1",
      startedAt: "2026-10-01 03:00:00",
    });

    const runs = await RankTrackingRepository.getRunsInRange({
      configId: "cfg_1",
      startStartedAt: "2026-09-30 00:00:00",
      endStartedAt: "2026-10-03 23:59:59",
    });

    expect(runs.map((r) => r.id)).toEqual(["run_new"]);
  });
});
