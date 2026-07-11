/**
 * End-to-end audit harness for badseo.dev.
 *
 * This drives the REAL OpenSEO audit engine (the same crawl + issue-detection
 * functions the production Worker uses) against a running badseo.dev, then
 * checks that every fixture triggers exactly the audit issues it declares.
 *
 * It reimplements only the crawl *frontier* loop — deliberately, so it can
 * crawl localhost (the production frontier's SSRF policy blocks private hosts).
 * Every actual detection call below is imported straight from ../src.
 *
 *   pnpm --filter badseo audit                 # against http://localhost:8787
 *   tsx scripts/run-audit.ts http://host:port  # against any origin
 */
import { crawlPage } from "../../src/server/workflows/site-audit-workflow-helpers";
import {
  discoverUrls,
  parseRobotsTxt,
} from "../../src/server/lib/audit/discovery";
import {
  normalizeUrl,
  isSameOrigin,
} from "../../src/server/lib/audit/url-utils";
import { runPageReporters } from "../../src/server/lib/audit/issues/page-reporters";
import {
  findDuplicates,
  findRedirectChainsAndLoops,
  type SlimPage,
} from "../../src/server/lib/audit/issues/multipage-checks";
import type { DetectedIssue } from "../../src/server/lib/audit/issues/page-reporters";
import type { CrawledPageResult } from "../../src/server/lib/audit/types";
import { AUDIT_ISSUE_TYPES } from "../../src/shared/audit-issues";
import { allFixtures, fixturePaths } from "../src/fixtures/registry";
import { TRAILING_SLASH_CANONICAL } from "../src/fixtures/redirects";
import type { Fixture, IssueId } from "../src/fixtures/types";

const BASE = (process.argv[2] ?? "http://localhost:8787").replace(/\/$/, "");
const MAX_PAGES = 200;
const CONCURRENCY = 10;

interface CrawlLink {
  sourceId: string;
  sourceUrl: string;
  targetUrl: string;
}

async function warmup(): Promise<void> {
  // Prime the dev server so healthy pages don't read as slow on a cold start.
  const paths = new Set<string>(["/", "/privacy"]);
  for (const f of allFixtures) for (const p of fixturePaths(f)) paths.add(p);
  await Promise.all(
    [...paths].map((p) =>
      fetch(`${BASE}${p}`, {
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
      }).catch(() => {}),
    ),
  );
}

interface CrawlEntry {
  url: string;
  depth: number | null;
}

/** BFS crawl frontier: link-discovered URLs first, sitemap-only URLs last. */
async function crawl(origin: string): Promise<{
  pages: CrawledPageResult[];
  links: CrawlLink[];
  completed: boolean;
}> {
  const { urls: sitemapUrls, robotsText } = await discoverUrls(
    origin,
    MAX_PAGES,
  );
  const robots = parseRobotsTxt(origin, robotsText);
  const sitemapSet = new Set(
    sitemapUrls.map((u) => normalizeUrl(u)).filter((u): u is string => !!u),
  );

  const visited = new Set<string>();
  const queued = new Set<string>();
  const linkQueue: CrawlEntry[] = [];
  const sitemapQueue: CrawlEntry[] = [];

  const start = normalizeUrl(`${origin}/`) ?? `${origin}/`;
  linkQueue.push({ url: start, depth: 0 });
  queued.add(start);
  for (const u of sitemapSet) {
    if (u === start || queued.has(u)) continue;
    sitemapQueue.push({ url: u, depth: null });
    queued.add(u);
  }

  const pages: CrawledPageResult[] = [];
  const links: CrawlLink[] = [];

  const enqueue = (url: string, depth: number | null) => {
    const n = normalizeUrl(url);
    if (!n) return;
    if (!isSameOrigin(n, origin)) return;
    if (visited.has(n) || queued.has(n)) return;
    if (!robots.isAllowed(n)) return;
    linkQueue.push({ url: n, depth });
    queued.add(n);
  };

  while (
    (linkQueue.length > 0 || sitemapQueue.length > 0) &&
    pages.length < MAX_PAGES
  ) {
    const batch: CrawlEntry[] = [];
    while (
      (linkQueue.length > 0 || sitemapQueue.length > 0) &&
      batch.length < CONCURRENCY &&
      pages.length + batch.length < MAX_PAGES
    ) {
      const entry = (linkQueue.length > 0 ? linkQueue : sitemapQueue).shift()!;
      queued.delete(entry.url);
      if (visited.has(entry.url)) continue;
      visited.add(entry.url);
      batch.push(entry);
    }

    const crawled = await Promise.all(
      batch.map((e) => crawlPage(e.url, e.depth, sitemapSet.has(e.url))),
    );

    for (let i = 0; i < crawled.length; i++) {
      const page = crawled[i];
      const depth = batch[i].depth;
      pages.push(page);

      for (const link of page.links) {
        if (link.isInternal) {
          links.push({
            sourceId: page.id,
            sourceUrl: page.url,
            targetUrl: link.targetUrl,
          });
          enqueue(link.targetUrl, depth === null ? null : depth + 1);
        }
      }
      if (page.redirectUrl) enqueue(page.redirectUrl, depth);
    }
  }

  const completed = linkQueue.length === 0 && sitemapQueue.length === 0;
  return { pages, links, completed };
}

/** In-memory equivalents of the two D1-backed multipage checks. */
function findBrokenInternalLinks(
  pages: CrawledPageResult[],
  links: CrawlLink[],
): DetectedIssue[] {
  const byUrl = new Map(pages.map((p) => [p.url, p]));
  const issues: DetectedIssue[] = [];
  const seen = new Set<string>();
  for (const link of links) {
    const target = byUrl.get(link.targetUrl);
    if (!target) continue;
    if (target.fetchClass !== "ok" || target.statusCode < 400) continue;
    const key = `${link.sourceUrl}::${link.targetUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    issues.push({
      issueType: "broken-internal-link",
      pageId: link.sourceId,
      pageUrl: link.sourceUrl,
      dedupeKey: link.targetUrl,
      details: { targetUrl: link.targetUrl, targetStatus: target.statusCode },
    });
  }
  return issues;
}

function findOrphanPages(
  pages: CrawledPageResult[],
  links: CrawlLink[],
  startUrl: string,
): DetectedIssue[] {
  const hasInlink = new Set<string>();
  for (const link of links) {
    const source = pages.find((p) => p.id === link.sourceId);
    // Self-links don't make a page reachable.
    if (source && source.url === link.targetUrl) continue;
    hasInlink.add(link.targetUrl);
  }
  const redirectTargets = new Set(
    pages.map((p) => p.redirectUrl).filter((u): u is string => !!u),
  );
  const issues: DetectedIssue[] = [];
  for (const page of pages) {
    if (page.fetchClass !== "ok") continue;
    if (page.statusCode < 200 || page.statusCode >= 300) continue;
    if (page.url === startUrl) continue;
    if (hasInlink.has(page.url) || redirectTargets.has(page.url)) continue;
    issues.push({
      issueType: "orphan-page",
      pageId: page.id,
      pageUrl: page.url,
    });
  }
  return issues;
}

function toSlim(page: CrawledPageResult): SlimPage {
  return {
    id: page.id,
    url: page.url,
    statusCode: page.statusCode,
    fetchClass: page.fetchClass,
    title: page.title || null,
    metaDescription: page.metaDescription || null,
    contentHash: page.contentHash,
    redirectUrl: page.redirectUrl,
    wordCount: page.wordCount,
    isIndexable: page.isIndexable,
    canonicalUrl: page.canonicalUrl,
    headerCanonicalUrl: page.headerCanonicalUrl,
  };
}

// ---- ANSI helpers -------------------------------------------------------
const c = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

const INFO_ISSUES = new Set<IssueId>(
  (Object.keys(AUDIT_ISSUE_TYPES) as IssueId[]).filter(
    (id) => AUDIT_ISSUE_TYPES[id].severity === "info",
  ),
);

async function main() {
  console.log(c.bold(`\n🧪 badseo.dev audit harness → ${BASE}\n`));

  await warmup();
  const origin = new URL(BASE).origin;
  const startUrl = normalizeUrl(`${origin}/`) ?? `${origin}/`;
  const { pages, links, completed } = await crawl(origin);

  if (process.env.DEBUG_DEPTH) {
    for (const p of pages) {
      if (p.url.includes("/structure/deep/")) {
        console.log(`  depth ${p.crawlDepth}  ${p.url}`);
      }
    }
  }

  // Assign deterministic-ish ids already handled by crawlPage; run detection.
  const detected: DetectedIssue[] = [];
  for (const page of pages) detected.push(...runPageReporters(page));
  const slim = pages.map(toSlim);
  detected.push(...findDuplicates(slim));
  detected.push(...findRedirectChainsAndLoops(slim));
  detected.push(...findBrokenInternalLinks(pages, links));
  if (completed) detected.push(...findOrphanPages(pages, links, startUrl));

  const byUrl = new Map<string, Set<IssueId>>();
  for (const issue of detected) {
    const set = byUrl.get(issue.pageUrl) ?? new Set<IssueId>();
    set.add(issue.issueType);
    byUrl.set(issue.pageUrl, set);
  }
  const crawledUrls = new Set(pages.map((p) => p.url));

  console.log(
    c.dim(
      `crawled ${pages.length} pages, ${links.length} internal links, ${detected.length} issues, crawl ${
        completed ? "completed" : "TRUNCATED"
      }\n`,
    ),
  );

  interface Row {
    name: string;
    url: string;
    ok: boolean;
    detail: string;
  }
  const rows: Row[] = [];
  let failures = 0;

  const check = (
    name: string,
    path: string,
    expected: IssueId[],
    support: boolean,
  ) => {
    const url = normalizeUrl(`${origin}${path}`) ?? `${origin}${path}`;
    const got = byUrl.get(url) ?? new Set<IssueId>();
    if (!crawledUrls.has(url)) {
      failures++;
      rows.push({ name, url, ok: false, detail: c.red("NOT CRAWLED") });
      return;
    }
    const expectedSet = new Set(expected);
    if (support) {
      // Support pages may carry info-level noise (e.g. a deep waypoint that is
      // itself deep) but must not have critical/warning issues.
      const bad = [...got].filter((id) => !INFO_ISSUES.has(id));
      const ok = bad.length === 0;
      if (!ok) failures++;
      rows.push({
        name,
        url,
        ok,
        detail: ok
          ? c.dim("clean (support)")
          : c.red(`unexpected: ${bad.join(", ")}`),
      });
      return;
    }
    const missing = [...expectedSet].filter((id) => !got.has(id));
    const extra = [...got].filter((id) => !expectedSet.has(id));
    const ok = missing.length === 0 && extra.length === 0;
    if (!ok) failures++;
    const parts: string[] = [];
    if (missing.length) parts.push(c.red(`missing: ${missing.join(", ")}`));
    if (extra.length) parts.push(c.yellow(`extra: ${extra.join(", ")}`));
    rows.push({
      name,
      url,
      ok,
      detail: ok ? c.green(expected.join(", ") || "clean") : parts.join("  "),
    });
  };

  // Non-fixture content pages must be clean.
  check("Homepage", "/", [], false);
  check("Privacy policy", "/privacy", [], false);

  const byCategory = new Map<string, Fixture[]>();
  for (const f of allFixtures) {
    const list = byCategory.get(f.category) ?? [];
    list.push(f);
    byCategory.set(f.category, list);
  }

  for (const f of allFixtures) {
    check(f.name, f.path, f.expectedIssues, f.support === true);
  }

  // Explicit regression guard for the trailing-slash redirect cycle
  // (every-app/open-seo#61): the canonical page must resolve to a 200 with no
  // redirect loop and no error. Fix-agnostic on purpose — the 200 lands on the
  // slash form under the root-cause fix (slashes preserved) or on the non-slash
  // form under older slash-stripping code that inline-follows. A crawler that
  // still strips and doesn't follow would 508 or record a self-redirect loop.
  {
    const base = `${origin}${TRAILING_SLASH_CANONICAL}`;
    const urls = [base, `${base}/`];
    const related = pages.filter((p) => urls.includes(p.url));
    const has200 = related.some(
      (p) => p.fetchClass === "ok" && p.statusCode >= 200 && p.statusCode < 300,
    );
    const looped = related.some((p) =>
      (byUrl.get(p.url) ?? new Set<IssueId>()).has("redirect-loop"),
    );
    const errored = related.some(
      (p) => p.fetchClass === "error" || p.statusCode >= 500,
    );
    const ok = has200 && !looped && !errored;
    if (!ok) failures++;
    rows.push({
      name: "Trailing-slash cycle → 200, no loop",
      url: base,
      ok,
      detail: ok
        ? c.green("canonical crawled as 200, no redirect loop")
        : c.red(
            related.length === 0
              ? "NOT CRAWLED (looped or dropped)"
              : `200=${has200} loop=${looped} error=${errored}`,
          ),
    });
  }

  // ---- report ----
  const pad = Math.max(...rows.map((r) => r.name.length));
  for (const r of rows) {
    const icon = r.ok ? c.green("✓") : c.red("✗");
    console.log(`${icon} ${r.name.padEnd(pad)}  ${r.detail}`);
  }

  const total = rows.length;
  console.log(
    "\n" +
      (failures === 0
        ? c.green(c.bold(`ALL ${total} CHECKS PASSED`))
        : c.red(c.bold(`${failures}/${total} CHECKS FAILED`))),
  );

  // Coverage: every audit issue type should be exercised by at least one page.
  const exercised = new Set(allFixtures.flatMap((f) => f.expectedIssues));
  const allTypes = Object.keys(AUDIT_ISSUE_TYPES) as IssueId[];
  const uncovered = allTypes.filter((id) => !exercised.has(id));
  console.log(
    c.dim(
      `\nissue-type coverage: ${allTypes.length - uncovered.length}/${allTypes.length}` +
        (uncovered.length
          ? `  (missing: ${uncovered.join(", ")})`
          : "  ✓ all covered"),
    ),
  );

  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
