import type { WorkflowStep } from "cloudflare:workers";
import type { RobotsResult } from "@/server/lib/audit/discovery";
import type { StepPageSummary } from "@/server/lib/audit/types";
import { isSameOrigin, normalizeUrl } from "@/server/lib/audit/url-utils";
import { isCrawlableUrl } from "@/server/lib/audit/url-policy";
import { deterministicAuditRowId } from "@/server/lib/audit/ids";
import { runPageReporters } from "@/server/lib/audit/issues/page-reporters";
import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import { AuditProgressKV } from "@/server/lib/audit/progress-kv";
import { crawlPage } from "@/server/workflows/site-audit-workflow-helpers";
import { pgStep } from "@/server/workflows/pgStep";

const CRAWL_CONCURRENCY = 25;
// Keep durable step state under the ~1MiB limit: full link lists live in D1;
// the step return only carries new-to-the-frontier targets, deduped across
// the batch and capped.
const MAX_FRONTIER_LINKS_PER_BATCH = 2_000;
const MAX_SUMMARY_TITLE_CHARS = 300;

function shouldQueueCrawlLink(
  link: string,
  origin: string,
  robots: RobotsResult,
  visited: Set<string>,
  queued: Set<string>,
): boolean {
  return (
    isSameOrigin(link, origin) &&
    isCrawlableUrl(link) &&
    robots.isAllowed(link) &&
    !visited.has(link) &&
    !queued.has(link)
  );
}

interface QueueEntry {
  url: string;
  /** Clicks from the start URL; null when only reachable via sitemap. */
  depth: number | null;
}

type CrawlPhaseParams = {
  auditId: string;
  workflowInstanceId: string;
  origin: string;
  startUrl: string;
  maxPages: number;
  robots: RobotsResult;
  sitemapUrls: string[];
};

/** What later phases need per page — no link lists (those stay in D1). */
export type CrawledPageSummary = Omit<StepPageSummary, "internalLinks">;

export type CrawlPhaseResult = {
  pages: CrawledPageSummary[];
  /** True when the frontier was exhausted before hitting maxPages. */
  completed: boolean;
};

export async function runCrawlPhase(
  step: WorkflowStep,
  params: CrawlPhaseParams,
): Promise<CrawlPhaseResult> {
  const {
    auditId,
    workflowInstanceId,
    origin,
    startUrl,
    maxPages,
    robots,
    sitemapUrls,
  } = params;
  const visited = new Set<string>();
  const queued = new Set<string>();
  // Link-discovered URLs crawl first (BFS from the start URL); sitemap-only
  // URLs drain last so link discovery isn't starved of page budget and
  // orphan detection stays meaningful.
  const linkQueue: QueueEntry[] = [];
  const sitemapQueue: QueueEntry[] = [];
  const sitemapSet = new Set<string>();
  const summaries: CrawledPageSummary[] = [];

  const normalizedStart = normalizeUrl(startUrl) ?? startUrl;
  if (
    robots.isAllowed(normalizedStart) &&
    isSameOrigin(normalizedStart, origin)
  ) {
    linkQueue.push({ url: normalizedStart, depth: 0 });
    queued.add(normalizedStart);
  }

  for (const sitemapUrl of sitemapUrls) {
    const normalized = normalizeUrl(sitemapUrl);
    if (!normalized) continue;
    sitemapSet.add(normalized);
    if (!shouldQueueCrawlLink(normalized, origin, robots, visited, queued)) {
      continue;
    }
    sitemapQueue.push({ url: normalized, depth: null });
    queued.add(normalized);
  }

  let crawlBatchIndex = 0;
  while (
    (linkQueue.length > 0 || sitemapQueue.length > 0) &&
    summaries.length < maxPages
  ) {
    const batchEntries = selectNextCrawlBatch({
      linkQueue,
      sitemapQueue,
      queued,
      visited,
      robots,
      remaining: maxPages - summaries.length,
    });
    if (batchEntries.length === 0) continue;

    crawlBatchIndex += 1;
    const crawledBatch = await runCrawlBatch(step, {
      crawlBatchIndex,
      auditId,
      batchEntries,
      sitemapSet,
      visited,
      queued,
    });
    // Keep only the slim summary in memory: at 10k pages, retaining link
    // lists for the whole crawl would not fit in the 128MB Worker heap.
    summaries.push(
      ...crawledBatch.map(({ internalLinks: _links, ...summary }) => summary),
    );

    enqueueDiscoveredLinks({
      crawledBatch,
      batchEntries,
      linkQueue,
      queued,
      visited,
      origin,
      robots,
    });
    await persistCrawlProgress({
      step,
      crawlBatchIndex,
      auditId,
      workflowInstanceId,
      crawledBatch,
      pagesCrawled: summaries.length,
      visitedCount: visited.size,
      queueLength: linkQueue.length + sitemapQueue.length,
      maxPages,
    });
  }

  return {
    pages: summaries,
    completed: linkQueue.length === 0 && sitemapQueue.length === 0,
  };
}

function selectNextCrawlBatch(params: {
  linkQueue: QueueEntry[];
  sitemapQueue: QueueEntry[];
  queued: Set<string>;
  visited: Set<string>;
  robots: RobotsResult;
  remaining: number;
}) {
  const { linkQueue, sitemapQueue, queued, visited, robots, remaining } =
    params;
  const batchSize = Math.min(CRAWL_CONCURRENCY, remaining);
  const batchEntries: QueueEntry[] = [];

  while (
    (linkQueue.length > 0 || sitemapQueue.length > 0) &&
    batchEntries.length < batchSize
  ) {
    const entry = (linkQueue.length > 0 ? linkQueue : sitemapQueue).shift()!;
    queued.delete(entry.url);
    if (visited.has(entry.url)) continue;
    if (!robots.isAllowed(entry.url)) continue;
    visited.add(entry.url);
    batchEntries.push(entry);
  }

  return batchEntries;
}

async function runCrawlBatch(
  step: WorkflowStep,
  input: {
    crawlBatchIndex: number;
    auditId: string;
    batchEntries: QueueEntry[];
    sitemapSet: Set<string>;
    visited: Set<string>;
    queued: Set<string>;
  },
): Promise<StepPageSummary[]> {
  const {
    crawlBatchIndex,
    auditId,
    batchEntries,
    sitemapSet,
    visited,
    queued,
  } = input;
  return pgStep(step, `crawl-batch-${crawlBatchIndex}`, undefined, async () => {
    const pages = await Promise.all(
      batchEntries.map((entry) =>
        crawlPage(entry.url, entry.depth, sitemapSet.has(entry.url)),
      ),
    );

    // Deterministic ids keep the D1 writes idempotent across step retries.
    for (const page of pages) {
      page.id = await deterministicAuditRowId(auditId, page.url);
    }

    const issues = pages.flatMap((page) => runPageReporters(page));
    await AuditRepository.insertCrawledBatch(auditId, pages, issues);

    // Frontier candidates only: drop targets already visited/queued and
    // dedupe across the batch, so the step return stays far under the
    // ~1MiB durable-state limit even on mega-menu sites.
    const seenTargets = new Set<string>();
    return pages.map((page) => {
      const internalLinks: string[] = [];
      for (const link of page.links) {
        if (!link.isInternal) continue;
        if (seenTargets.size >= MAX_FRONTIER_LINKS_PER_BATCH) break;
        if (visited.has(link.targetUrl) || queued.has(link.targetUrl)) continue;
        if (seenTargets.has(link.targetUrl)) continue;
        seenTargets.add(link.targetUrl);
        internalLinks.push(link.targetUrl);
      }
      return {
        id: page.id,
        url: page.url,
        statusCode: page.statusCode,
        fetchClass: page.fetchClass,
        redirectUrl: page.redirectUrl,
        title: page.title.slice(0, MAX_SUMMARY_TITLE_CHARS),
        internalLinks,
      };
    });
  });
}

function enqueueDiscoveredLinks(params: {
  crawledBatch: StepPageSummary[];
  batchEntries: QueueEntry[];
  linkQueue: QueueEntry[];
  queued: Set<string>;
  visited: Set<string>;
  origin: string;
  robots: RobotsResult;
}) {
  const {
    crawledBatch,
    batchEntries,
    linkQueue,
    queued,
    visited,
    origin,
    robots,
  } = params;
  const depthByUrl = new Map(
    batchEntries.map((entry) => [entry.url, entry.depth]),
  );

  for (const pageResult of crawledBatch) {
    const pageDepth = depthByUrl.get(pageResult.url) ?? null;
    const childDepth = pageDepth === null ? null : pageDepth + 1;

    for (const link of pageResult.internalLinks) {
      if (!shouldQueueCrawlLink(link, origin, robots, visited, queued)) {
        continue;
      }
      linkQueue.push({ url: link, depth: childDepth });
      queued.add(link);
    }

    // Redirect targets continue the same navigation path: same depth.
    const redirectTarget = pageResult.redirectUrl;
    if (
      redirectTarget &&
      shouldQueueCrawlLink(redirectTarget, origin, robots, visited, queued)
    ) {
      linkQueue.push({ url: redirectTarget, depth: pageDepth });
      queued.add(redirectTarget);
    }
  }
}

async function persistCrawlProgress(params: {
  step: WorkflowStep;
  crawlBatchIndex: number;
  auditId: string;
  workflowInstanceId: string;
  crawledBatch: StepPageSummary[];
  pagesCrawled: number;
  visitedCount: number;
  queueLength: number;
  maxPages: number;
}) {
  const {
    step,
    crawlBatchIndex,
    auditId,
    workflowInstanceId,
    crawledBatch,
    pagesCrawled,
    visitedCount,
    queueLength,
    maxPages,
  } = params;
  // KV push + D1 progress in one step — merging them halves the per-batch
  // step count against the ~1k step budget. The D1 update is idempotent; the
  // KV push can duplicate entries on a partial retry, which is acceptable for
  // an ephemeral progress feed (capped list, short TTL).
  await pgStep(
    step,
    `progress-batch-${crawlBatchIndex}`,
    undefined,
    async () => {
      await AuditProgressKV.pushCrawledUrls(
        auditId,
        crawledBatch.map((pageResult) => ({
          url: pageResult.url,
          statusCode: pageResult.statusCode,
          title: pageResult.title,
          crawledAt: Date.now(),
        })),
      );
      await AuditRepository.updateAuditProgress(auditId, workflowInstanceId, {
        pagesCrawled,
        pagesTotal: Math.min(visitedCount + queueLength, maxPages),
      });
    },
  );
}
