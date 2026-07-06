import type { WorkflowStep } from "cloudflare:workers";
import type { RobotsResult } from "@/server/lib/audit/discovery";
import type { StepPageResult } from "@/server/lib/audit/types";
import { isSameOrigin, normalizeUrl } from "@/server/lib/audit/url-utils";
import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import { AuditProgressKV } from "@/server/lib/audit/progress-kv";
import { crawlPage } from "@/server/workflows/site-audit-workflow-helpers";
import { pgStep } from "@/server/workflows/pgStep";

const CRAWL_CONCURRENCY = 25;

function shouldQueueCrawlLink(
  link: string,
  origin: string,
  robots: RobotsResult,
  visited: Set<string>,
  queued: Set<string>,
): boolean {
  return (
    isSameOrigin(link, origin) &&
    robots.isAllowed(link) &&
    !visited.has(link) &&
    !queued.has(link)
  );
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

export async function runCrawlPhase(
  step: WorkflowStep,
  params: CrawlPhaseParams,
): Promise<StepPageResult[]> {
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
  const queue: string[] = [];
  const queued = new Set<string>();
  const allPages: StepPageResult[] = [];

  seedCrawlQueue({
    startUrl,
    origin,
    robots,
    sitemapUrls,
    visited,
    queued,
    queue,
  });

  let crawlBatchIndex = 0;
  while (queue.length > 0 && allPages.length < maxPages) {
    const urlsToCrawl = selectNextCrawlBatch(
      queue,
      queued,
      visited,
      robots,
      maxPages - allPages.length,
    );
    if (urlsToCrawl.length === 0) continue;

    crawlBatchIndex += 1;
    const crawledBatch = await runCrawlBatch(
      step,
      crawlBatchIndex,
      urlsToCrawl,
      origin,
    );

    // De-duplicate by final URL within the batch. If two queued URLs resolved
    // to the same post-redirect destination (e.g. /about → /about/ while
    // /about/ was also in the batch), store only the first result.
    const seenFinalUrls = new Set<string>();
    const uniqueBatch = crawledBatch.filter((p) => {
      if (seenFinalUrls.has(p.url)) return false;
      seenFinalUrls.add(p.url);
      return true;
    });
    allPages.push(...uniqueBatch);

    enqueueDiscoveredLinks({
      crawledBatch: uniqueBatch,
      queue,
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
      crawledBatch: uniqueBatch,
      pagesCrawled: allPages.length,
      visitedCount: visited.size,
      queueLength: queue.length,
      maxPages,
    });
  }

  return allPages;
}

function seedCrawlQueue({
  startUrl,
  origin,
  robots,
  sitemapUrls,
  visited,
  queued,
  queue,
}: {
  startUrl: string;
  origin: string;
  robots: RobotsResult;
  sitemapUrls: string[];
  visited: Set<string>;
  queued: Set<string>;
  queue: string[];
}) {
  const normalizedStart = normalizeUrl(startUrl) ?? startUrl;
  if (
    robots.isAllowed(normalizedStart) &&
    isSameOrigin(normalizedStart, origin)
  ) {
    queue.push(normalizedStart);
    queued.add(normalizedStart);
  }

  for (const sitemapUrl of sitemapUrls) {
    const normalized = normalizeUrl(sitemapUrl);
    if (!normalized) continue;
    if (!shouldQueueCrawlLink(normalized, origin, robots, visited, queued)) {
      continue;
    }
    queue.push(normalized);
    queued.add(normalized);
  }
}

function selectNextCrawlBatch(
  queue: string[],
  queued: Set<string>,
  visited: Set<string>,
  robots: RobotsResult,
  remaining: number,
) {
  const batchSize = Math.min(CRAWL_CONCURRENCY, remaining);
  const urlsToCrawl: string[] = [];

  while (queue.length > 0 && urlsToCrawl.length < batchSize) {
    const url = queue.shift()!;
    queued.delete(url);
    if (visited.has(url)) continue;
    if (!robots.isAllowed(url)) continue;
    visited.add(url);
    // Pre-emptively block the trailing-slash counterpart so /about and /about/
    // can never appear in the same batch (or any later one). The one that
    // dequeues first is crawled; the redirect leads to the canonical form, and
    // enqueueDiscoveredLinks marks pageResult.url visited afterwards.
    visited.add(url.endsWith("/") ? url.slice(0, -1) : url + "/");
    urlsToCrawl.push(url);
  }

  return urlsToCrawl;
}

async function runCrawlBatch(
  step: WorkflowStep,
  crawlBatchIndex: number,
  urlsToCrawl: string[],
  origin: string,
): Promise<StepPageResult[]> {
  return step.do(`crawl-batch-${crawlBatchIndex}`, async () => {
    const settled = await Promise.allSettled(
      urlsToCrawl.map((url) => crawlPage(url, origin)),
    );
    return settled.flatMap((result) => {
      if (result.status === "fulfilled" && result.value) {
        return [result.value];
      }
      return [];
    });
  });
}

function enqueueDiscoveredLinks(params: {
  crawledBatch: StepPageResult[];
  queue: string[];
  queued: Set<string>;
  visited: Set<string>;
  origin: string;
  robots: RobotsResult;
}) {
  const { crawledBatch, queue, queued, visited, origin, robots } = params;
  for (const pageResult of crawledBatch) {
    // Mark the final URL (post-redirect) as visited so a canonical trailing-slash
    // URL from the sitemap isn't re-crawled after the bare path already fetched it.
    visited.add(pageResult.url);
    for (const link of pageResult.internalLinks.filter((candidate) =>
      shouldQueueCrawlLink(candidate, origin, robots, visited, queued),
    )) {
      queue.push(link);
      queued.add(link);
    }
  }
}

async function persistCrawlProgress(params: {
  step: WorkflowStep;
  crawlBatchIndex: number;
  auditId: string;
  workflowInstanceId: string;
  crawledBatch: StepPageResult[];
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
  await step.do(`kv-progress-batch-${crawlBatchIndex}`, async () => {
    await AuditProgressKV.pushCrawledUrls(
      auditId,
      crawledBatch.map((pageResult) => ({
        url: pageResult.url,
        statusCode: pageResult.statusCode,
        title: pageResult.title,
        crawledAt: Date.now(),
      })),
    );
  });

  await pgStep(
    step,
    `progress-batch-${crawlBatchIndex}`,
    undefined,
    async () => {
      await AuditRepository.updateAuditProgress(auditId, workflowInstanceId, {
        pagesCrawled,
        pagesTotal: Math.min(visitedCount + queueLength, maxPages),
      });
    },
  );
}
