/**
 * Per-audit crawl scratchpad — a SQLite-backed Durable Object.
 *
 * Holds all transient crawl state for one audit (id = auditId): the frontier
 * (URL queue + seen-set), the internal-link edges, and a slim mirror of page
 * rows. This keeps chatty crawl-loop writes off Postgres, removes the ~1MiB
 * Workflow step-output limits (nothing large flows through step returns
 * anymore), and gives the finalize link checks a local SQL database.
 *
 * Lifecycle: seeded by the discover-urls step, read/written by every crawl
 * chunk, queried once at finalize, then destroyed on success. A self-cleanup
 * alarm set on every construction guarantees any instantiation — including a
 * write racing in after destroy() — is wiped after 7 days (failed audits'
 * state doubles as the resume/debug artifact until then).
 *
 * All methods are synchronous inside (SQLite in DOs is sync), so each RPC is
 * effectively atomic. Writes are idempotent: the workflow retries steps, so
 * every insert is OR IGNORE / OR REPLACE on a stable key.
 */
import { DurableObject, env } from "cloudflare:workers";

export interface ClaimedUrl {
  url: string;
  /** Clicks from the start URL; null when only reachable via sitemap. */
  depth: number | null;
  inSitemap: boolean;
}

export interface FrontierStats {
  /** Pages attempted (crawled or errored) so far. */
  attempted: number;
  /** URLs still waiting to be crawled. */
  pending: number;
  /** Every URL ever enqueued (attempted + pending + leased). */
  seen: number;
}

interface ScratchpadPageRow {
  pageId: string;
  url: string;
  statusCode: number;
  fetchClass: string;
  redirectUrl: string | null;
}

export interface ScratchpadLinkRow {
  sourcePageId: string;
  sourceUrl: string;
  targetUrl: string;
  anchor: string | null;
  isNofollow: boolean;
}

interface RecordBatchInput {
  /** URLs whose crawl attempt finished (successfully or not). */
  crawledUrls: string[];
  pages: ScratchpadPageRow[];
  links: ScratchpadLinkRow[];
  /** Newly discovered same-origin URLs to enqueue (already policy-filtered). */
  discovered: Array<{ url: string; depth: number | null }>;
}

interface BrokenLinkRow {
  sourcePageId: string;
  sourceUrl: string;
  targetUrl: string;
  targetStatus: number;
}

interface OrphanPageRow {
  pageId: string;
  url: string;
}

const BROKEN_LINK_ISSUE_CAP = 2_000;
const CLEANUP_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * Stop storing link edges once the database reaches this size. Link rows are
 * the only unbounded-per-page data; a pathological link-dense site could
 * otherwise hit the platform's per-object SQLite cap (1 GB on the free plan
 * self-hosters may run on) and fail the crawl with SQLITE_FULL. Past the
 * budget the crawl continues — the audit just loses link-graph issues.
 */
const LINK_STORAGE_BUDGET_BYTES = 500 * 1024 * 1024;

export class AuditScratchpad extends DurableObject {
  constructor(ctx: DurableObjectState, workerEnv: Env) {
    super(ctx, workerEnv);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS frontier (
        url TEXT PRIMARY KEY,
        depth INTEGER,
        source TEXT NOT NULL,
        in_sitemap INTEGER NOT NULL DEFAULT 0,
        state TEXT NOT NULL DEFAULT 'pending',
        chunk_no INTEGER
      );
      CREATE INDEX IF NOT EXISTS frontier_claim_idx ON frontier (state, source);
      CREATE TABLE IF NOT EXISTS links (
        source_page_id TEXT NOT NULL,
        source_url TEXT NOT NULL,
        target_url TEXT NOT NULL,
        anchor TEXT,
        is_nofollow INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (source_page_id, target_url)
      );
      CREATE INDEX IF NOT EXISTS links_target_idx ON links (target_url);
      CREATE TABLE IF NOT EXISTS page_mirror (
        page_id TEXT PRIMARY KEY,
        url TEXT NOT NULL UNIQUE,
        status_code INTEGER,
        fetch_class TEXT NOT NULL,
        redirect_url TEXT
      );
      CREATE INDEX IF NOT EXISTS page_mirror_redirect_idx ON page_mirror (redirect_url);
    `);
    // Guarantee the cleanup alarm on EVERY instantiation, not just at seed:
    // any RPC (even one racing in right after destroy()) re-creates the
    // tables above, and without an alarm that storage would leak forever.
    // blockConcurrencyWhile gates RPC delivery on its own; the returned
    // promise doesn't need observing (constructors can't await).
    void this.ctx.blockConcurrencyWhile(() => this.ensureCleanupAlarm());
  }

  async seedStart(url: string): Promise<void> {
    this.ctx.storage.sql.exec(
      `INSERT OR IGNORE INTO frontier (url, depth, source, in_sitemap) VALUES (?, 0, 'link', 0)`,
      url,
    );
  }

  async seedSitemapUrls(urls: string[]): Promise<void> {
    for (const url of urls) {
      // Upsert so a URL that already exists (e.g. the start URL) still gets
      // its in-sitemap flag; queue position and depth stay as first seen.
      this.ctx.storage.sql.exec(
        `INSERT INTO frontier (url, depth, source, in_sitemap) VALUES (?, NULL, 'sitemap', 1)
         ON CONFLICT(url) DO UPDATE SET in_sitemap = 1`,
        url,
      );
    }
  }

  /**
   * Lease the next batch of pending URLs for one crawl chunk. Idempotent per
   * chunkNo: a retried step gets back exactly the URLs its failed attempt
   * had leased (link-discovered URLs drain before sitemap-only ones, FIFO
   * within each class — same ordering as the old in-memory queues).
   */
  async claimChunk(chunkNo: number, limit: number): Promise<ClaimedUrl[]> {
    const existing = this.selectClaimed(
      `SELECT url, depth, in_sitemap FROM frontier WHERE state = 'leased' AND chunk_no = ?`,
      chunkNo,
    );
    if (existing.length > 0) return existing;
    // A retried step whose earlier attempt already crawled this chunk's
    // leases must not claim a fresh set under the same chunk number — that
    // would duplicate work and overshoot the page budget.
    const done = this.ctx.storage.sql
      .exec<{
        n: number;
      }>(
        `SELECT COUNT(*) AS n FROM frontier WHERE chunk_no = ? AND state = 'crawled'`,
        chunkNo,
      )
      .one();
    if (done.n > 0) return [];
    if (limit <= 0) return [];

    const fresh = this.selectClaimed(
      `SELECT url, depth, in_sitemap FROM frontier WHERE state = 'pending'
       ORDER BY CASE source WHEN 'link' THEN 0 ELSE 1 END, rowid LIMIT ?`,
      limit,
    );
    for (const row of fresh) {
      this.ctx.storage.sql.exec(
        `UPDATE frontier SET state = 'leased', chunk_no = ? WHERE url = ?`,
        chunkNo,
        row.url,
      );
    }
    return fresh;
  }

  /** Persist one crawled sub-batch: completions, mirror rows, links, frontier. */
  async recordBatch(input: RecordBatchInput): Promise<FrontierStats> {
    for (const url of input.crawledUrls) {
      this.ctx.storage.sql.exec(
        `UPDATE frontier SET state = 'crawled' WHERE url = ?`,
        url,
      );
    }
    for (const page of input.pages) {
      this.ctx.storage.sql.exec(
        `INSERT OR REPLACE INTO page_mirror (page_id, url, status_code, fetch_class, redirect_url)
         VALUES (?, ?, ?, ?, ?)`,
        page.pageId,
        page.url,
        page.statusCode,
        page.fetchClass,
        page.redirectUrl,
      );
    }
    // Database size only ever grows (deletes happen solely via destroy), so
    // once the budget trips it stays tripped — runFinalizeChecks uses the
    // same comparison to know the link graph is incomplete.
    if (this.ctx.storage.sql.databaseSize < LINK_STORAGE_BUDGET_BYTES) {
      for (const link of input.links) {
        this.ctx.storage.sql.exec(
          `INSERT OR IGNORE INTO links (source_page_id, source_url, target_url, anchor, is_nofollow)
           VALUES (?, ?, ?, ?, ?)`,
          link.sourcePageId,
          link.sourceUrl,
          link.targetUrl,
          link.anchor,
          link.isNofollow ? 1 : 0,
        );
      }
    }
    for (const found of input.discovered) {
      // OR IGNORE: already-seen URLs (crawled, leased, or pending) keep
      // their existing row — this is the global dedup.
      this.ctx.storage.sql.exec(
        `INSERT OR IGNORE INTO frontier (url, depth, source, in_sitemap) VALUES (?, ?, 'link', 0)`,
        found.url,
        found.depth,
      );
    }
    return this.stats();
  }

  /** Return unattempted leases to the queue (chunk soft-deadline hit). */
  async releaseUrls(urls: string[]): Promise<void> {
    for (const url of urls) {
      this.ctx.storage.sql.exec(
        `UPDATE frontier SET state = 'pending', chunk_no = NULL WHERE url = ? AND state = 'leased'`,
        url,
      );
    }
  }

  async getStats(): Promise<FrontierStats> {
    return this.stats();
  }

  /**
   * The two finalize checks that need link edges, as local SQL. Mirrors the
   * former Postgres implementations in multipage.ts exactly.
   */
  async runFinalizeChecks(input: {
    startUrl: string;
    crawlCompleted: boolean;
  }): Promise<{ brokenLinks: BrokenLinkRow[]; orphanPages: OrphanPageRow[] }> {
    // Only flag targets we actually crawled and saw fail — never inferred
    // from absence. Blocked targets (WAF challenges) are excluded: a 403
    // from bot protection is not evidence of a broken link.
    const brokenLinks = this.ctx.storage.sql
      .exec<{
        source_page_id: string;
        source_url: string;
        target_url: string;
        target_status: number;
      }>(
        `SELECT l.source_page_id, l.source_url, l.target_url, m.status_code AS target_status
         FROM links l JOIN page_mirror m ON m.url = l.target_url
         WHERE m.status_code >= 400 AND m.fetch_class = 'ok'
         ORDER BY l.source_page_id, l.target_url
         LIMIT ?`,
        BROKEN_LINK_ISSUE_CAP,
      )
      .toArray()
      .map((row) => ({
        sourcePageId: row.source_page_id,
        sourceUrl: row.source_url,
        targetUrl: row.target_url,
        targetStatus: row.target_status,
      }));

    // A live 2xx page is an orphan when no OTHER crawled page links to it
    // and nothing redirects to it. Only meaningful on a completed crawl with
    // a complete link graph — if the storage budget truncated link writes,
    // "no inbound edge" is missing data, not evidence of orphanhood.
    const linkGraphComplete =
      this.ctx.storage.sql.databaseSize < LINK_STORAGE_BUDGET_BYTES;
    const orphanPages =
      input.crawlCompleted && linkGraphComplete
        ? this.ctx.storage.sql
            .exec<{ page_id: string; url: string }>(
              `SELECT m.page_id, m.url FROM page_mirror m
             WHERE m.url != ?
               AND m.fetch_class = 'ok'
               AND m.status_code >= 200 AND m.status_code < 300
               AND NOT EXISTS (
                 SELECT 1 FROM links l
                 WHERE l.target_url = m.url AND l.source_page_id != m.page_id
               )
               AND NOT EXISTS (
                 SELECT 1 FROM page_mirror r WHERE r.redirect_url = m.url
               )`,
              input.startUrl,
            )
            .toArray()
            .map((row) => ({ pageId: row.page_id, url: row.url }))
        : [];

    return { brokenLinks, orphanPages };
  }

  /** Wipe all state (success path, or explicit audit deletion). */
  async destroy(): Promise<void> {
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  /** Same wipe exposed under the common erasure RPC used by the admin tool. */
  async destroyForErasure(): Promise<void> {
    await this.destroy();
  }

  /**
   * Self-cleanup for audits whose workflow died without reaching finalize.
   * Full destroy(), not just deleteAll(): under our compatibility date,
   * deleteAll() does not clear alarm state, and a leftover alarm would keep
   * the object (and its billing) alive.
   */
  async alarm(): Promise<void> {
    await this.destroy();
  }

  private async ensureCleanupAlarm(): Promise<void> {
    const existing = await this.ctx.storage.getAlarm();
    if (existing === null) {
      await this.ctx.storage.setAlarm(Date.now() + CLEANUP_AFTER_MS);
    }
  }

  private selectClaimed(query: string, param: number): ClaimedUrl[] {
    return this.ctx.storage.sql
      .exec<{ url: string; depth: number | null; in_sitemap: number }>(
        query,
        param,
      )
      .toArray()
      .map((row) => ({
        url: row.url,
        depth: row.depth,
        inSitemap: row.in_sitemap === 1,
      }));
  }

  private stats(): FrontierStats {
    const row = this.ctx.storage.sql
      .exec<{ attempted: number; pending: number; seen: number }>(
        `SELECT
           COUNT(*) FILTER (WHERE state = 'crawled') AS attempted,
           COUNT(*) FILTER (WHERE state = 'pending') AS pending,
           COUNT(*) AS seen
         FROM frontier`,
      )
      .one();
    return {
      attempted: row.attempted,
      pending: row.pending,
      seen: row.seen,
    };
  }
}

/** Stub for the audit's scratchpad DO (one instance per audit id). */
export function getAuditScratchpad(auditId: string) {
  // env.d.ts declares the binding untyped (ambient contexts can't import the
  // class); narrow here so callers get typed RPC methods.
  const namespace =
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the binding is declared as this class in wrangler.jsonc
    env.AUDIT_SCRATCHPAD as unknown as DurableObjectNamespace<AuditScratchpad>;
  return namespace.get(namespace.idFromName(auditId));
}
