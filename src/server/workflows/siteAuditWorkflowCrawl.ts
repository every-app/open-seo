import { env, type WorkflowStep } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import type { RobotsResult } from "@/server/lib/audit/discovery";
import type { AuditConfig, CrawledPageResult } from "@/server/lib/audit/types";
import {
  getAuditScratchpad,
  type ClaimedUrl,
} from "@/server/features/audit/AuditScratchpad";
import { persistCrawledPages } from "@/server/workflows/siteAuditWorkflowPersist";
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
import {
  estimateRenderingCredits,
  renderUsageCredits,
  type RenderUsage,
} from "@/shared/audit-rendering";
import type { CrawlerAccess } from "@/shared/crawler-access";
import { pgStep } from "@/server/workflows/pgStep";
import { CRAWL_CHUNK_STEP } from "@/server/workflows/auditStepConfigs";
import { getContextFetch } from "@/server/lib/provider-access";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";

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
/**
 * How long past its soft deadline a chunk may keep waiting before it logs the
 * fetches it is still waiting on. Longer than any single page fetch or render.
 */
const STUCK_CHUNK_GRACE_MS = 60_000;
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

type CrawlPhaseParams = {
  auditId: string;
  workflowInstanceId: string;
  origin: string;
  maxPages: number;
  robots: RobotsResult;
  /** Frontier size after discovery seeding (from the discover-urls step). */
  seededCount: number;
  renderJavaScript?: boolean;
  sitePlatform?: AuditConfig["sitePlatform"];
  /**
   * Rendering totals across chunks. Mutated as each chunk step returns, so a
   * failed audit can still settle what its completed chunks rendered.
   */
  renderUsage: RenderUsage;
  /** Crawler-access headers for the audited host, when the org has one. */
  access?: CrawlerAccess | null;
  /**
   * A metered rendered audit's credit hold. No fetch starts after its
   * deadline or once rendering it could cost more than it holds.
   */
  renderHold?: { deadlineAt: number; credits: number };
};

export type CrawlPhaseResult = {
  pagesCrawled: number;
  /** True when the frontier was exhausted before hitting maxPages. */
  completed: boolean;
  /** Why the crawl stopped before running out of URLs or pages. */
  stoppedBy?:
    | "crawl-rate-limited"
    | "crawl-time-limit"
    | "crawl-credits-exhausted";
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
    const stoppedBy = result.rateLimited
      ? "crawl-rate-limited"
      : result.timedOut
        ? "crawl-time-limit"
        : result.outOfCredits && "crawl-credits-exhausted";
    if (stoppedBy) {
      return { pagesCrawled: attemptedTotal, completed: false, stoppedBy };
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

type CrawlChunkResult = {
  attemptedInChunk: number;
  attempted: number;
  pending: number;
  endWindow: number;
  rateLimited?: boolean;
  timedOut?: boolean;
  outOfCredits?: boolean;
  throttleState?: CrawlThrottleState;
  resumeAt?: number;
  renderUsage?: RenderUsage;
};

async function runCrawlChunk(
  input: CrawlPhaseParams & {
    chunkNo: number;
    attemptedBefore: number;
    startWindow: number;
    throttleState?: CrawlThrottleState;
  },
): Promise<CrawlChunkResult> {
  const { auditId, workflowInstanceId, origin, maxPages, robots, chunkNo } =
    input;
  const scratchpad = getAuditScratchpad(auditId);
  const renderDeadlineAt = input.renderHold?.deadlineAt ?? Infinity;
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
  // One line at each end of a chunk, so a crawl that stops making progress
  // shows where: inside a chunk, in a cooldown between chunks, or replaying.
  const startedAt = Date.now();
  console.info("site_audit:chunk_start", {
    auditId,
    chunkNo,
    claimed: claimed.length,
    isRetry,
  });
  const logChunkEnd = (result: CrawlChunkResult) => {
    console.info("site_audit:chunk_end", {
      auditId,
      chunkNo,
      attemptedInChunk: result.attemptedInChunk,
      attempted: result.attempted,
      pending: result.pending,
      durationMs: Date.now() - startedAt,
      rateLimited: result.rateLimited,
      timedOut: result.timedOut,
      outOfCredits: result.outOfCredits,
      resumeAt: result.resumeAt && new Date(result.resumeAt).toISOString(),
    });
    return result;
  };
  const deadlineAt = Math.min(
    Date.now() + CHUNK_SOFT_DEADLINE_MS,
    renderDeadlineAt,
  );
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
    return logChunkEnd({
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
    });
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
  const inFlightSince = new Map<string, number>();
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
          sitePlatform: input.sitePlatform,
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
  // Whether `pending` in-flight pages and one more, each at the Context worst
  // case, still fit the hold on top of what this audit has rendered so far.
  const canAffordRender = (pending: number) =>
    !input.renderHold ||
    renderUsageCredits({
      cloudflareAttempts:
        input.renderUsage.cloudflareAttempts + renderUsage.cloudflareAttempts,
      contextCredits:
        input.renderUsage.contextCredits + renderUsage.contextCredits,
    }) +
      estimateRenderingCredits(pending + 1).high <=
      input.renderHold.credits;
  const render = input.renderJavaScript
    ? async (url: string) => {
        const { RenderedPageService } =
          await import("@/server/lib/audit/rendered-page");
        return RenderedPageService.renderPage(url, {
          browser: env.BROWSER,
          // Behind an Every App gateway its calls are the audit's
          // organization's, named around the Workflow's run() and carried
          // into this step by pgStep.
          contextFetch: await getContextFetch(),
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
      {
        access: input.access,
        render,
        renderThrottled: input.sitePlatform === "shopify",
      },
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
        inFlightSince.delete(entry.url);
      });
    inFlight.add(promise);
    inFlightSince.set(entry.url, Date.now());
  };

  // Hosted logs keep only the path: a query string or user info in a link the
  // audited site controls can carry secrets. Self-hosters read their own logs.
  const logFullUrls = !(await isHostedServerAuthMode());
  const stuckTimer = setTimeout(
    () => {
      console.warn("site_audit:chunk_stuck", {
        auditId,
        chunkNo,
        queuedPersists,
        inFlight: [...inFlightSince].map(([url, since]) => ({
          url: logFullUrls ? url : new URL(url).pathname,
          seconds: Math.round((Date.now() - since) / 1000),
        })),
      });
    },
    Math.max(0, deadlineAt - Date.now()) + STUCK_CHUNK_GRACE_MS,
  );
  while (true) {
    while (
      inFlight.size < windowSize &&
      nextIndex < claimed.length &&
      Date.now() < deadlineAt
    ) {
      // queuedPersists changes when persistChain settles. Keep it out of the
      // loop condition because the type-aware linter cannot see that async
      // mutation and flags the otherwise valid backpressure check.
      if (
        throttle.stopped ||
        queuedPersists > MAX_QUEUED_PERSIST_BATCHES ||
        !canAffordRender(inFlight.size)
      )
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
  clearTimeout(stuckTimer);
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
  return logChunkEnd({
    attemptedInChunk,
    attempted: stats.attempted,
    pending: stats.pending,
    endWindow: windowSize,
    rateLimited: throttle.stopped,
    outOfCredits: unattempted.length > 0 && !canAffordRender(0),
    // Work is left and neither now nor the site's pacing allows another
    // request before the deadline, so no later chunk could start one either.
    timedOut:
      unattempted.length > 0 &&
      Math.max(
        Date.now(),
        throttleState.pausedUntil,
        throttleState.nextRequestAt,
      ) >= renderDeadlineAt,
    throttleState,
    resumeAt:
      throttleState.pausedUntil > Date.now()
        ? throttleState.pausedUntil
        : undefined,
    renderUsage,
  });
}
