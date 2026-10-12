import { env, type WorkflowStep } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import type { RobotsResult } from "@/server/lib/audit/discovery";
import type { CrawledPageResult } from "@/server/lib/audit/types";
import { isSameOrigin } from "@/server/lib/audit/url-utils";
import { isCrawlableUrl } from "@/server/lib/audit/url-policy";
import { deterministicAuditRowId } from "@/server/lib/audit/ids";
import { runPageReporters } from "@/server/lib/audit/issues/page-reporters";
import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import {
  getAuditScratchpad,
  type ClaimedUrl,
  type FrontierStats,
  type ScratchpadPageLinksRow,
} from "@/server/features/audit/AuditScratchpad";
import { AuditProgressKV } from "@/server/lib/audit/progress-kv";
import {
  adjustCrawlWindow,
  clampCrawlWindow,
  CRAWL_WINDOW,
  RETRY_CRAWL_WINDOW,
} from "@/server/lib/audit/crawl-window";
import {
  createCrawlThrottle,
  type CrawlThrottleState,
} from "@/server/lib/audit/crawl-throttle";
import { crawlPage } from "@/server/workflows/site-audit-workflow-helpers";
import type { RenderUsage } from "@/shared/audit-rendering";
import type { CrawlerAccess } from "@/shared/crawler-access";
import { pgStep } from "@/server/workflows/pgStep";
import { CRAWL_CHUNK_STEP } from "@/server/workflows/auditStepConfigs";

/**
 * The crawl runs in chunks: each chunk is one durable step that leases up to
 * CHUNK_TARGET_PAGES URLs from the scratchpad DO, crawls them with a rolling
 * concurrency window, and persists results incrementally (full page rows to
 * the app DB, links/mirror/frontier updates to the DO). Step returns carry
 * only counters, so step state stays tiny regardless of site size and the
 * workflow heap stays O(one batch).
 */
const CHUNK_TARGET_PAGES = 200;
/** Stop launching new fetches after this long; leftover leases are released. */
const CHUNK_SOFT_DEADLINE_MS = 90_000;
/** Crawled pages are persisted in sub-batches of this size. */
const PERSIST_BATCH_SIZE = 25;
/**
 * The first sub-batch of a chunk is deliberately small: the crawl window
 * only adapts when a sub-batch persists, and on a heavy-page site a full
 * 25-page batch crawled at the starting window was already enough to
 * exceed the isolate's memory. Five pages tell the byte bound what the
 * site's pages weigh before the window commits to more.
 */
const FIRST_PERSIST_BATCH_SIZE = 5;
/**
 * Stop launching new fetches while more than this many persist sub-batches
 * are waiting: persistence is sequential, so when the DB falls behind a fast
 * site, unpersisted page results would otherwise pile up in memory without
 * bound.
 */
const MAX_QUEUED_PERSIST_BATCHES = 2;

/**
 * Mega-menu/footer-heavy sites can carry 1000+ links per page; cap what we
 * record so a 10k-page crawl can't produce tens of millions of link targets
 * to scan at finalize.
 */
const MAX_STORED_LINKS_PER_PAGE = 500;
/**
 * Cap newly discovered URLs sent to the scratchpad per persist sub-batch.
 * Serialized RPC messages are limited to 32 MiB; a crawler-trap page family
 * (faceted nav, calendars) can emit tens of thousands of unique URLs per
 * page. Dropped URLs are usually re-discovered from later pages, and a site
 * generating this many is past maxPages anyway.
 */
const MAX_DISCOVERED_PER_BATCH = 20_000;
const MAX_PROGRESS_TITLE_CHARS = 300;

function shouldQueueCrawlLink(
  link: string,
  origin: string,
  robots: RobotsResult,
): boolean {
  return (
    isSameOrigin(link, origin) && isCrawlableUrl(link) && robots.isAllowed(link)
  );
}

type CrawlPhaseParams = {
  auditId: string;
  workflowInstanceId: string;
  origin: string;
  maxPages: number;
  robots: RobotsResult;
  /** Frontier size after discovery seeding (from the discover-urls step). */
  seededCount: number;
  renderJavaScript?: boolean;
  /**
   * Rendering totals across chunks. Mutated as each chunk step returns, so a
   * failed audit can still settle what its completed chunks rendered.
   */
  renderUsage: RenderUsage;
  /** Crawler-access headers for the audited host, when the org has one. */
  access?: CrawlerAccess | null;
};

export type CrawlPhaseResult = {
  pagesCrawled: number;
  /** True when the frontier was exhausted before hitting maxPages. */
  completed: boolean;
  rateLimited?: boolean;
};

export async function runCrawlPhase(
  step: WorkflowStep,
  params: CrawlPhaseParams,
): Promise<CrawlPhaseResult> {
  let chunkNo = 0;
  let attemptedTotal = 0;
  let pending = params.seededCount;
  let zeroProgressChunks = 0;
  // The adapted window carries across chunks via durable step results:
  // without this every chunk restarted at the initial window and re-learned
  // the site's page weight the hard way — on heavy-page sites that meant an
  // exceededMemory death every ~200 pages.
  let windowHint = CRAWL_WINDOW.initial;
  let throttleState: CrawlThrottleState | undefined;

  while (pending > 0 && attemptedTotal < params.maxPages) {
    chunkNo += 1;
    const result = await pgStep(
      step,
      `crawl-chunk-${chunkNo}`,
      CRAWL_CHUNK_STEP,
      () =>
        runCrawlChunk({
          ...params,
          chunkNo,
          attemptedBefore: attemptedTotal,
          startWindow: windowHint,
          throttleState,
        }),
    );
    // Apply the chunk's counters even when it did no new work (a retried
    // chunk whose earlier attempt persisted everything reports 0 attempts
    // with up-to-date scratchpad totals) — finalize must not see stale ones.
    attemptedTotal = result.attempted;
    pending = result.pending;
    params.renderUsage.cloudflareAttempts +=
      result.renderUsage?.cloudflareAttempts ?? 0;
    params.renderUsage.contextCredits +=
      result.renderUsage?.contextCredits ?? 0;
    if (result.rateLimited) {
      return {
        pagesCrawled: attemptedTotal,
        completed: false,
        rateLimited: true,
      };
    }
    // `?? initial`: an instance in flight across a deploy replays cached
    // step results from before endWindow existed.
    windowHint = result.endWindow ?? CRAWL_WINDOW.initial;
    throttleState = result.throttleState;
    if (pending > 0 && attemptedTotal < params.maxPages && result.resumeAt) {
      // The timestamp comes from the persisted chunk result. Always replay
      // the same sleep step, even when that timestamp is now in the past.
      await step.sleepUntil(`crawl-cooldown-${chunkNo}`, result.resumeAt);
      zeroProgressChunks = 0;
      continue;
    }
    // One zero-attempt chunk is normal (retry of a completed chunk number);
    // two in a row means the frontier is unservable — stop with what we
    // have instead of spinning forever.
    zeroProgressChunks =
      result.attemptedInChunk === 0 ? zeroProgressChunks + 1 : 0;
    if (zeroProgressChunks >= 2) break;
  }

  return { pagesCrawled: attemptedTotal, completed: pending === 0 };
}

async function runCrawlChunk(
  input: CrawlPhaseParams & {
    chunkNo: number;
    attemptedBefore: number;
    startWindow: number;
    throttleState?: CrawlThrottleState;
  },
): Promise<{
  attemptedInChunk: number;
  attempted: number;
  pending: number;
  endWindow: number;
  rateLimited?: boolean;
  throttleState?: CrawlThrottleState;
  resumeAt?: number;
  renderUsage?: RenderUsage;
}> {
  const { auditId, workflowInstanceId, origin, maxPages, robots, chunkNo } =
    input;
  const scratchpad = getAuditScratchpad(auditId);
  let previousThrottle =
    (await scratchpad.getCrawlThrottle()) ?? input.throttleState;

  const claimLimit = Math.min(
    CHUNK_TARGET_PAGES,
    maxPages - input.attemptedBefore,
  );
  const { urls: claimed, isRetry } = await scratchpad.claimChunk(
    chunkNo,
    claimLimit,
  );
  const deadlineAt = Date.now() + CHUNK_SOFT_DEADLINE_MS;
  if (isRetry && previousThrottle) {
    // Requests made since the last checkpoint may have consumed a slot.
    previousThrottle = {
      ...previousThrottle,
      nextRequestAt: Math.max(
        previousThrottle.nextRequestAt,
        Date.now() + previousThrottle.intervalMs,
      ),
    };
  }
  const throttle = createCrawlThrottle(
    deadlineAt,
    previousThrottle,
    async (state) => {
      try {
        await scratchpad.saveCrawlThrottle(state);
      } catch {
        // A retry cannot safely honor a cooldown that failed to checkpoint.
        throw new NonRetryableError(
          "Unable to save the site's crawl cooldown.",
        );
      }
    },
  );
  if (claimed.length === 0) {
    const stats = await scratchpad.getStats();
    return {
      attemptedInChunk: 0,
      attempted: stats.attempted,
      pending: stats.pending,
      endWindow: input.startWindow,
      throttleState: throttle.state,
      rateLimited: throttle.stopped,
      resumeAt:
        throttle.state.pausedUntil > Date.now()
          ? throttle.state.pausedUntil
          : undefined,
    };
  }

  const depthByUrl = new Map(claimed.map((entry) => [entry.url, entry.depth]));

  // A retry means the previous attempt died mid-crawl (in production almost
  // always exceededMemory), and it is the chunk's last attempt — so it runs
  // under drastically reduced limits instead of the profile that just failed.
  const limits = isRetry ? RETRY_CRAWL_WINDOW : CRAWL_WINDOW;
  let windowSize = isRetry
    ? limits.initial
    : clampCrawlWindow(input.startWindow, limits);
  let nextIndex = 0;
  let attemptedInChunk = 0;
  const inFlight = new Set<Promise<void>>();
  const deferred: string[] = [];
  let persistThreshold = FIRST_PERSIST_BATCH_SIZE;
  let batch: CrawledPageResult[] = [];
  // Persistence runs concurrently with fetching (pipelined) but sequentially
  // with itself, so DB write pressure stays bounded at one batch at a time.
  let persistChain: Promise<unknown> = Promise.resolve();
  let queuedPersists = 0;

  const flush = () => {
    if (batch.length === 0) return;
    const pages = batch;
    batch = [];
    persistThreshold = PERSIST_BATCH_SIZE;
    windowSize = adjustCrawlWindow(windowSize, pages, limits);
    queuedPersists += 1;
    persistChain = persistChain
      .then(() =>
        persistCrawledPages({
          auditId,
          workflowInstanceId,
          origin,
          robots,
          scratchpad,
          pages,
          depthByUrl,
          maxPages,
        }),
      )
      .finally(() => {
        queuedPersists -= 1;
      });
  };

  // This attempt's rendering counts, returned in the step result. The audit's
  // credit lock is settled once, when the audit ends.
  const renderUsage: RenderUsage = { cloudflareAttempts: 0, contextCredits: 0 };
  const render = input.renderJavaScript
    ? async (url: string) => {
        const { RenderedPageService } =
          await import("@/server/lib/audit/rendered-page");
        return RenderedPageService.renderPage(url, {
          browser: env.BROWSER,
          contextApiKey: env.CONTEXT_API_KEY,
          auditId,
          usage: renderUsage,
        });
      }
    : undefined;

  const launch = (entry: ClaimedUrl) => {
    const promise = crawlPage(
      entry.url,
      entry.depth,
      entry.inSitemap,
      throttle,
      { access: input.access, render },
    )
      .then((page) => {
        if (!page) {
          deferred.push(entry.url);
          return;
        }
        attemptedInChunk += 1;
        batch.push(page);
        if (batch.length >= persistThreshold) flush();
      })
      .finally(() => {
        inFlight.delete(promise);
      });
    inFlight.add(promise);
  };

  while (true) {
    while (
      inFlight.size < windowSize &&
      nextIndex < claimed.length &&
      Date.now() < deadlineAt
    ) {
      // queuedPersists changes when persistChain settles. Keep it out of the
      // loop condition because the type-aware linter cannot see that async
      // mutation and flags the otherwise valid backpressure check.
      if (throttle.stopped || queuedPersists > MAX_QUEUED_PERSIST_BATCHES)
        break;
      launch(claimed[nextIndex]);
      nextIndex += 1;
    }
    if (inFlight.size > 0) {
      await Promise.race(inFlight);
      continue;
    }
    // Nothing in flight. If launches are only paused by persistence
    // backpressure, wait for the queue to drain and resume; otherwise the
    // chunk is done (leases exhausted or soft deadline hit).
    if (
      !throttle.stopped &&
      queuedPersists > MAX_QUEUED_PERSIST_BATCHES &&
      nextIndex < claimed.length &&
      Date.now() < deadlineAt
    ) {
      await persistChain;
      continue;
    }
    break;
  }
  flush();
  await persistChain;
  await scratchpad.saveCrawlThrottle(throttle.state);

  // Preserve URLs without a page result, including slots stopped by a cooldown.
  const unattempted = [
    ...deferred,
    ...claimed.slice(nextIndex).map((entry) => entry.url),
  ];
  if (unattempted.length > 0) {
    await scratchpad.releaseUrls(unattempted);
  }

  // Progress counters are written per persisted sub-batch (in
  // persistCrawledPages), so a chunk that dies mid-way underreports by at
  // most one sub-batch, not a whole chunk.
  const stats = await scratchpad.getStats();
  const throttleState = throttle.state;
  return {
    attemptedInChunk,
    attempted: stats.attempted,
    pending: stats.pending,
    endWindow: windowSize,
    rateLimited: throttle.stopped,
    throttleState,
    resumeAt:
      throttleState.pausedUntil > Date.now()
        ? throttleState.pausedUntil
        : undefined,
    renderUsage,
  };
}

async function persistCrawledPages(input: {
  auditId: string;
  workflowInstanceId: string;
  origin: string;
  robots: RobotsResult;
  scratchpad: ReturnType<typeof getAuditScratchpad>;
  pages: CrawledPageResult[];
  depthByUrl: Map<string, number | null>;
  maxPages: number;
}): Promise<FrontierStats> {
  const { auditId, origin, robots, scratchpad, pages, depthByUrl } = input;

  // Deterministic ids keep every write idempotent across step retries.
  for (const page of pages) {
    page.id = await deterministicAuditRowId(auditId, page.url);
  }
  const issues = pages.flatMap((page) => runPageReporters(page));
  await AuditRepository.insertCrawledBatch(auditId, pages, issues);

  const links: ScratchpadPageLinksRow[] = [];
  const discovered = new Map<string, number | null>();
  for (const page of pages) {
    const pageDepth = depthByUrl.get(page.url) ?? null;
    const childDepth = pageDepth === null ? null : pageDepth + 1;

    const targets: string[] = [];
    for (const link of page.links) {
      if (!link.isInternal) continue;
      if (targets.length < MAX_STORED_LINKS_PER_PAGE) {
        targets.push(link.targetUrl);
      }
      if (
        discovered.size < MAX_DISCOVERED_PER_BATCH &&
        !discovered.has(link.targetUrl) &&
        shouldQueueCrawlLink(link.targetUrl, origin, robots)
      ) {
        discovered.set(link.targetUrl, childDepth);
      }
    }
    if (targets.length > 0) {
      links.push({ pageId: page.id, url: page.url, targets });
    }

    // Redirect targets continue the same navigation path: same depth.
    if (
      page.redirectUrl &&
      !discovered.has(page.redirectUrl) &&
      shouldQueueCrawlLink(page.redirectUrl, origin, robots)
    ) {
      discovered.set(page.redirectUrl, pageDepth);
    }
  }

  const stats = await scratchpad.recordBatch({
    crawledUrls: pages.map((page) => page.url),
    pages: pages.map((page) => ({
      pageId: page.id,
      url: page.url,
      statusCode: page.statusCode,
      fetchClass: page.fetchClass,
      redirectUrl: page.redirectUrl,
    })),
    links,
    discovered: Array.from(discovered, ([url, depth]) => ({ url, depth })),
  });

  await AuditRepository.updateAuditProgress(auditId, input.workflowInstanceId, {
    pagesCrawled: stats.attempted,
    pagesTotal: Math.min(stats.seen, input.maxPages),
  });
  await AuditProgressKV.pushCrawledUrls(
    auditId,
    pages.map((page) => ({
      url: page.url,
      statusCode: page.statusCode,
      title: page.title.slice(0, MAX_PROGRESS_TITLE_CHARS),
      crawledAt: Date.now(),
    })),
  );
  return stats;
}
