/**
 * The scratchpad's finalize queries run against a real SQLite engine here —
 * node:sqlite ships the same JSON1 functions the Durable Object's SQLite
 * exposes, so the exact query strings the DO executes can be exercised
 * without a Workers runtime.
 */
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import {
  BROKEN_LINKS_SQL,
  ORPHAN_PAGES_SQL,
  SCRATCHPAD_SCHEMA_SQL,
} from "@/server/features/audit/scratchpad-sql";

const START = "https://site.test/";

let db: DatabaseSync;

function addPage(
  pageId: string,
  url: string,
  opts: {
    status?: number;
    fetchClass?: string;
    redirectUrl?: string | null;
  } = {},
) {
  db.prepare(
    `INSERT INTO page_mirror (page_id, url, status_code, fetch_class, redirect_url)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    pageId,
    url,
    opts.status ?? 200,
    opts.fetchClass ?? "ok",
    opts.redirectUrl ?? null,
  );
}

function addLinks(pageId: string, url: string, targets: string[]) {
  db.prepare(
    `INSERT OR REPLACE INTO page_links (page_id, url, targets_json) VALUES (?, ?, ?)`,
  ).run(pageId, url, JSON.stringify(targets));
}

function addLegacyLinks(pageId: string, url: string, targets: string[]) {
  for (const target of targets) {
    db.prepare(
      `INSERT OR IGNORE INTO links (source_page_id, source_url, target_url) VALUES (?, ?, ?)`,
    ).run(pageId, url, target);
  }
}

function brokenLinks(limit = 100) {
  return db.prepare(BROKEN_LINKS_SQL).all(limit);
}

function orphanPages() {
  return db.prepare(ORPHAN_PAGES_SQL).all(START);
}

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec(SCRATCHPAD_SCHEMA_SQL);
});

describe("broken internal links", () => {
  it("reports a crawled-and-failed target once, ignoring fine and uncrawled targets", () => {
    addPage("p1", START);
    addPage("p2", "https://site.test/gone", { status: 404 });
    addPage("p3", "https://site.test/ok");
    addLinks("p1", START, [
      "https://site.test/gone",
      "https://site.test/ok",
      "https://site.test/never-crawled",
    ]);

    expect(brokenLinks()).toEqual([
      {
        source_page_id: "p1",
        source_url: START,
        target_url: "https://site.test/gone",
        target_status: 404,
      },
    ]);
  });

  it("ignores WAF-blocked 4xx targets", () => {
    addPage("p1", START);
    addPage("p2", "https://site.test/waf", {
      status: 403,
      fetchClass: "blocked",
    });
    addLinks("p1", START, ["https://site.test/waf"]);

    expect(brokenLinks()).toEqual([]);
  });

  it("includes legacy per-edge rows from a crawl that predates the JSON layout", () => {
    addPage("p1", START);
    addPage("p2", "https://site.test/two");
    addPage("p3", "https://site.test/gone", { status: 500 });
    addLegacyLinks("p1", START, ["https://site.test/gone"]);
    addLinks("p2", "https://site.test/two", ["https://site.test/gone"]);

    expect(brokenLinks().map((row) => row.source_page_id)).toEqual([
      "p1",
      "p2",
    ]);
  });

  it("respects the row limit and orders deterministically", () => {
    addPage("p1", START);
    for (let i = 0; i < 5; i += 1) {
      addPage(`b${i}`, `https://site.test/gone-${i}`, { status: 404 });
    }
    addLinks(
      "p1",
      START,
      Array.from({ length: 5 }, (_, i) => `https://site.test/gone-${i}`),
    );

    expect(brokenLinks(2).map((row) => row.target_url)).toEqual([
      "https://site.test/gone-0",
      "https://site.test/gone-1",
    ]);
  });
});

describe("orphan pages", () => {
  it("flags a 2xx page nothing links to, not the start URL or a linked page", () => {
    addPage("p1", START);
    addPage("p2", "https://site.test/lonely");
    addPage("p3", "https://site.test/linked");
    addLinks("p1", START, ["https://site.test/linked"]);

    expect(orphanPages()).toEqual([
      { page_id: "p2", url: "https://site.test/lonely" },
    ]);
  });

  it("does not rescue a page that only links to itself", () => {
    addPage("p1", START);
    addPage("p2", "https://site.test/lonely");
    addLinks("p2", "https://site.test/lonely", ["https://site.test/lonely"]);

    expect(orphanPages()).toEqual([
      { page_id: "p2", url: "https://site.test/lonely" },
    ]);
  });

  it("does not flag a page something redirects to", () => {
    addPage("p1", START);
    addPage("p2", "https://site.test/target");
    addPage("p3", "https://site.test/old", {
      status: 301,
      redirectUrl: "https://site.test/target",
    });

    expect(orphanPages()).toEqual([]);
  });

  it("ignores non-2xx and blocked pages", () => {
    addPage("p1", START);
    addPage("p2", "https://site.test/gone", { status: 404 });
    addPage("p3", "https://site.test/waf", {
      status: 200,
      fetchClass: "blocked",
    });

    expect(orphanPages()).toEqual([]);
  });

  it("counts legacy per-edge rows as inbound links", () => {
    addPage("p1", START);
    addPage("p2", "https://site.test/linked");
    addPage("p3", "https://site.test/self");
    addLegacyLinks("p1", START, ["https://site.test/linked"]);
    addLegacyLinks("p3", "https://site.test/self", ["https://site.test/self"]);

    expect(orphanPages()).toEqual([
      { page_id: "p3", url: "https://site.test/self" },
    ]);
  });
});

describe("query plans", () => {
  /**
   * Both checks must stay linear in link count. The failure mode to guard is
   * page_mirror (or the inbound set) being rescanned inside a per-row loop,
   * which is what an unhinted join order or a correlated NOT EXISTS produces.
   */
  function plan(sql: string, param: string | number): string[] {
    return db
      .prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .all(param)
      .map((row) => String(row["detail"]));
  }

  beforeEach(() => {
    for (let i = 0; i < 50; i += 1) {
      addPage(`p${i}`, `https://site.test/${i}`);
      addLinks(
        `p${i}`,
        `https://site.test/${i}`,
        Array.from(
          { length: 10 },
          (_, k) => `https://site.test/${(i + k) % 50}`,
        ),
      );
    }
  });

  it("seeks page_mirror by url for every link target", () => {
    const detail = plan(BROKEN_LINKS_SQL, 100);
    expect(detail).toContain(
      "SEARCH m USING INDEX sqlite_autoindex_page_mirror_2 (url=?)",
    );
    expect(detail.some((line) => /SCAN m\b/.test(line))).toBe(false);
  });

  it("materializes the inbound set once and probes it by index", () => {
    const detail = plan(ORPHAN_PAGES_SQL, START);
    expect(detail).toContain("MATERIALIZE inbound");
    expect(
      detail.some((line) =>
        line.includes("SEARCH inbound USING AUTOMATIC COVERING INDEX"),
      ),
    ).toBe(true);
    // page_mirror is scanned once as the outer loop, never per inbound row.
    expect(detail.filter((line) => /SCAN m\b/.test(line))).toHaveLength(1);
  });
});
