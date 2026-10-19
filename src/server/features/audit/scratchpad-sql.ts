/**
 * The scratchpad's SQLite schema and its two finalize link queries, kept in a
 * plain module (no `cloudflare:workers` import) so they can be exercised
 * against a real SQLite engine in tests as well as inside the Durable Object.
 */

/**
 * `page_links` holds one row per crawled page — its internal link targets as
 * a JSON array of URL strings — instead of one row per edge. Rows written is
 * the DO SQLite billing unit, and link edges dominate an audit's writes.
 * WITHOUT ROWID keeps the TEXT primary key as the table itself, so a page
 * costs exactly one row written rather than a row plus an autoindex entry.
 *
 * The legacy per-edge `links` table is still declared (without its target
 * index, which nothing queries any more) so an audit that was mid-crawl when
 * the JSON layout shipped can still be finalized from the rows its earlier
 * chunks wrote. Delete the table and the UNION ALL branches in the queries
 * below after 2026-09-10: the 7-day cleanup alarm guarantees every such
 * object is finished or wiped by then.
 */
export const SCRATCHPAD_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS frontier (
    url TEXT PRIMARY KEY,
    depth INTEGER,
    source TEXT NOT NULL,
    in_sitemap INTEGER NOT NULL DEFAULT 0,
    state TEXT NOT NULL DEFAULT 'pending',
    chunk_no INTEGER
  );
  CREATE INDEX IF NOT EXISTS frontier_claim_idx ON frontier (state, source);
  CREATE TABLE IF NOT EXISTS page_links (
    page_id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    targets_json TEXT NOT NULL
  ) WITHOUT ROWID;
  CREATE TABLE IF NOT EXISTS links (
    source_page_id TEXT NOT NULL,
    source_url TEXT NOT NULL,
    target_url TEXT NOT NULL,
    PRIMARY KEY (source_page_id, target_url)
  );
  CREATE TABLE IF NOT EXISTS page_mirror (
    page_id TEXT PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,
    status_code INTEGER,
    fetch_class TEXT NOT NULL,
    redirect_url TEXT
  );
  CREATE INDEX IF NOT EXISTS page_mirror_redirect_idx ON page_mirror (redirect_url);
`;

/**
 * Queue one link-discovered URL. Already-seen URLs keep their row (the
 * global dedup), except that a pending row with no click depth yet — almost
 * always a sitemap seed — takes the link's depth and link-queue priority
 * while keeping its in-sitemap flag. Sitemap seeding covers the whole
 * sitemap, so without this every linked sitemap page would crawl in sitemap
 * order with no depth. Takes (url, depth).
 */
export const FRONTIER_DISCOVER_SQL = `
  INSERT INTO frontier (url, depth, source, in_sitemap) VALUES (?, ?, 'link', 0)
  ON CONFLICT(url) DO UPDATE SET source = 'link', depth = excluded.depth
  WHERE frontier.state = 'pending' AND frontier.depth IS NULL
    AND excluded.depth IS NOT NULL
`;

/**
 * Every internal link whose target we crawled and saw fail. `json_each`
 * expands a page's target array into one row per edge; the join is on
 * page_mirror's UNIQUE url, so it stays an index seek per link. CROSS JOIN
 * pins that order — left to itself the planner drives page_mirror off
 * `fetch_class` via an automatic index and re-expands the JSON array per
 * candidate, which is quadratic in page count. Takes the issue cap as its
 * only parameter.
 */
export const BROKEN_LINKS_SQL = `
  SELECT source_page_id, source_url, target_url, target_status FROM (
    SELECT p.page_id AS source_page_id, p.url AS source_url, j.value AS target_url,
           m.status_code AS target_status
    FROM page_links p, json_each(p.targets_json) AS j
    CROSS JOIN page_mirror m ON m.url = j.value
    WHERE m.status_code >= 400 AND m.fetch_class = 'ok'
    UNION ALL
    SELECT l.source_page_id, l.source_url, l.target_url, m.status_code AS target_status
    FROM links l JOIN page_mirror m ON m.url = l.target_url
    WHERE m.status_code >= 400 AND m.fetch_class = 'ok'
  )
  ORDER BY source_page_id, target_url
  LIMIT ?
`;

/**
 * Pages nothing links to. The inbound set is built once and anti-joined,
 * rather than probed per page: without the old per-edge target index a
 * correlated NOT EXISTS would rescan the whole edge set for every page.
 * Self-links don't count (a page linking to itself doesn't rescue it), and
 * page_id is 1:1 with url in page_mirror, so comparing URLs is the same test
 * the per-edge form made on ids. Takes the start URL as its only parameter.
 */
export const ORPHAN_PAGES_SQL = `
  SELECT m.page_id, m.url FROM page_mirror m
  LEFT JOIN (
    SELECT DISTINCT j.value AS target_url
    FROM page_links p, json_each(p.targets_json) AS j
    WHERE j.value != p.url
    UNION ALL
    SELECT DISTINCT l.target_url
    FROM links l
    WHERE l.target_url != l.source_url
  ) inbound ON inbound.target_url = m.url
  WHERE m.url != ?
    AND m.fetch_class = 'ok'
    AND m.status_code >= 200 AND m.status_code < 300
    AND inbound.target_url IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM page_mirror r WHERE r.redirect_url = m.url
    )
`;
