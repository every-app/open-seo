import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Client } from "@libsql/client";
import { getLatestResults } from "./rankTrackingResults";
import { RankTrackingRepository } from "../repositories/RankTrackingRepository";

const runtime = vi.hoisted(() => ({
  env: { DATABASE_PROVIDER: "d1" },
  client: null as Client | null,
}));

vi.mock("cloudflare:workers", () => ({ env: runtime.env }));
vi.mock("@/db", async () => {
  const { createClient } = await import("@libsql/client");
  const { drizzle } = await import("drizzle-orm/libsql");
  runtime.client = createClient({ url: "file::memory:" });
  return { db: drizzle(runtime.client) };
});

// Both backends store timestamps as text. Real SQLite evaluates the shared
// query predicates for each stored format; schema imports remain SQLite.
beforeAll(async () => {
  await runtime.client!.executeMultiple(`
    CREATE TABLE rank_tracking_configs (
      id TEXT PRIMARY KEY, project_id TEXT, domain TEXT, location_code INTEGER,
      language_code TEXT, devices TEXT, serp_depth INTEGER, schedule_interval TEXT,
      location_name TEXT, is_active INTEGER, last_checked_at TEXT, next_check_at TEXT,
      last_skip_reason TEXT, created_at TEXT
    );
    CREATE TABLE rank_tracking_keywords (
      id TEXT PRIMARY KEY, config_id TEXT, keyword TEXT, match_case INTEGER,
      search_volume INTEGER, keyword_difficulty INTEGER, cpc REAL,
      metrics_fetched_at TEXT, pinned_at TEXT, created_at TEXT
    );
    CREATE TABLE rank_check_runs (
      id TEXT PRIMARY KEY, config_id TEXT, project_id TEXT, status TEXT,
      keywords_total INTEGER, keywords_checked INTEGER, is_subset_run INTEGER,
      error_message TEXT, started_at TEXT, completed_at TEXT
    );
    CREATE TABLE rank_snapshots (
      id INTEGER PRIMARY KEY, run_id TEXT, tracking_keyword_id TEXT, keyword TEXT,
      device TEXT, position INTEGER, url TEXT, serp_features TEXT, checked_at TEXT
    );
    INSERT INTO rank_tracking_configs (id, project_id) VALUES ('config', 'project');
    INSERT INTO rank_tracking_keywords (id, config_id, keyword)
      VALUES ('keyword', 'config', 'example query');
  `);
});

afterAll(() => {
  runtime.client!.close();
});

const snapshots = [
  { id: "old", checkedAt: "2026-09-24T11:54:41.036Z", position: 3 },
  { id: "previous", checkedAt: "2026-09-28T03:34:28.828Z", position: 1 },
  { id: "after-cutoff", checkedAt: "2026-09-28T05:00:00.000Z", position: 2 },
  { id: "latest", checkedAt: "2026-10-05T03:36:21.058Z", position: null },
];

describe.each(["d1", "postgres"])(
  "rank results with %s timestamps",
  (provider) => {
    beforeEach(async () => {
      runtime.env.DATABASE_PROVIDER = provider;
      vi.spyOn(Date, "now").mockReturnValue(
        Date.parse("2026-10-05T04:00:00.000Z"),
      );
      await runtime.client!.executeMultiple(
        "DELETE FROM rank_snapshots; DELETE FROM rank_check_runs;",
      );
      for (const snapshot of snapshots) {
        const checkedAt =
          provider === "postgres"
            ? snapshot.checkedAt
            : snapshot.checkedAt.slice(0, 19).replace("T", " ");
        await runtime.client!.execute({
          sql: `INSERT INTO rank_check_runs
          (id, config_id, project_id, status, is_subset_run, started_at)
          VALUES (?, 'config', 'project', 'completed', 0, ?)`,
          args: [snapshot.id, checkedAt],
        });
        await runtime.client!.execute({
          sql: `INSERT INTO rank_snapshots
          (run_id, tracking_keyword_id, keyword, device, position, checked_at)
          VALUES (?, 'keyword', 'example query', 'mobile', ?, ?)`,
          args: [snapshot.id, snapshot.position, checkedAt],
        });
      }
    });

    it("uses the newest snapshot before the selected period cutoff", async () => {
      const result = await getLatestResults("config", "project", "7d");

      expect(result.rows[0].mobile).toMatchObject({
        position: null,
        previousPosition: 1,
      });
    });

    it("drops same-day history snapshots taken before the cutoff", async () => {
      const history = await RankTrackingRepository.getKeywordHistory(
        "config",
        "keyword",
        7,
      );

      expect(history.map((row) => row.position)).toEqual([2, null]);
    });
  },
);
