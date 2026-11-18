/**
 * Pacing and 429 handling for one audit's origin.
 *
 * Every 429 pauses the whole crawl for the server's Retry-After (or an
 * escalating default), and the refused URL gets one more try after the pause.
 * A URL refused again is recorded as rate limited and the crawl moves on.
 * Shopify's edge, for one, refuses individual listing pages to crawlers while
 * serving everything around them, and a single such URL used to end audits
 * thousands of pages in. The crawl stops only when the site refuses several
 * URLs in a row without serving any, or has kept the crawler waiting for hours
 * in total.
 */

/** Retries per URL after its first 429. Every 429 still pauses new URLs. */
const MAX_429_RETRIES = 1;
/** URLs given up on in a row, with no page served between them, before the crawl stops. */
const MAX_REFUSED_URLS = 3;
const FIRST_DELAY_MS = 30_000;
const MIN_INTERVAL_MS = 1_000;
const MAX_INTERVAL_MS = 10_000;
/** Pages served in a row before pacing returns to normal. */
const RECOVERY_PAGES = 20;
/**
 * Waiting on 429s one audit may do in total. Cumulative, never reset: a site
 * that interleaves refusals with served pages must still end, and a rendered
 * audit must settle inside its 24-hour credit lock. Room for about sixty
 * refused URLs at Shopify's 60-second Retry-After.
 */
const MAX_COOLDOWN_MS = 2 * 60 * 60_000;
/** Longest single wait on a 429 during discovery. */
const DISCOVERY_WAIT_MS = 60_000;
/** All the waiting on 429s one discovery run may do, inside its step timeout. */
const DISCOVERY_WAIT_BUDGET_MS = 120_000;

/** Checkpointed between chunks so a new step does not forget site limits. */
export type CrawlThrottleState = {
  intervalMs: number;
  nextRequestAt: number;
  pausedUntil: number;
  /**
   * 429s per URL still awaiting a retry. Kept here rather than in the fetch
   * loop because a pause often outlasts the chunk and the URL comes back in
   * the next one; without this it started over at its first try.
   */
  refusals: Record<string, number>;
  /** URLs given up on since the last served page. */
  givenUpRun: number;
  /** Pages served since the last 429. */
  served: number;
  /** Waiting accrued over the whole audit. */
  cooldownMs: number;
};

/** `Retry-After` is either delay-seconds or an HTTP-date. */
export function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const value = header.trim();
  // Keep over-budget values finite for checkpoint serialization/arithmetic.
  if (/^\d+$/.test(value))
    return Math.min(Number(value) * 1_000, MAX_COOLDOWN_MS + 1);
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.max(0, at - Date.now());
}

export interface CrawlThrottle {
  /** False when this chunk can no longer start a request. */
  ready(): Promise<boolean>;
  /** Pause the origin on a 429 of `url`; return whether this URL may be tried again. */
  backoff(url: string, retryAfter: string | null): Promise<boolean>;
  /** Give `url` up as refused after a 429 nothing could read; pauses like backoff. */
  refuse(url: string, retryAfter: string | null): Promise<void>;
  /** A non-429 response for `url` ends a run of refusals. */
  recovered(url: string): Promise<void>;
  readonly checkpointFailed: boolean;
  readonly stopped: boolean;
  readonly state: CrawlThrottleState;
}

/** One audit's origin pacing. Long waits are resumed by the workflow. */
export function createCrawlThrottle(
  deadlineAt: number,
  previous?: CrawlThrottleState,
  persist?: (state: CrawlThrottleState) => Promise<void>,
): CrawlThrottle {
  const state: CrawlThrottleState = {
    intervalMs: MIN_INTERVAL_MS,
    nextRequestAt: 0,
    pausedUntil: 0,
    givenUpRun: 0,
    served: 0,
    cooldownMs: 0,
    ...previous,
    // A checkpoint from before refusals were tracked per URL has none.
    refusals: { ...previous?.refusals },
  };
  let checkpointFailed = false;
  let checkpoint = Promise.resolve();
  const snapshot = () => ({ ...state, refusals: { ...state.refusals } });
  const save = () => {
    const saved = snapshot();
    checkpoint = checkpoint
      .then(() => persist?.(saved))
      .catch((error) => {
        checkpointFailed = true;
        throw error;
      });
    return checkpoint;
  };
  const stopped = () =>
    checkpointFailed ||
    state.givenUpRun >= MAX_REFUSED_URLS ||
    state.cooldownMs > MAX_COOLDOWN_MS;
  /** Record the `count`th 429 of `url` and pause the origin. */
  const pause = async (
    url: string,
    count: number,
    retryAfter: string | null,
  ) => {
    state.served = 0;
    // A URL's second refusal is expected on Shopify and says nothing new
    // about the site's pace; only a fresh URL's 429 slows the crawl down.
    if (count === 1) {
      state.intervalMs = Math.min(MAX_INTERVAL_MS, state.intervalMs * 2);
    }
    if (count > MAX_429_RETRIES) {
      delete state.refusals[url];
      state.givenUpRun += 1;
    } else {
      state.refusals[url] = count;
    }
    // Without a Retry-After, each URL given up on doubles the default wait.
    const delayMs = Math.max(
      state.intervalMs,
      parseRetryAfterMs(retryAfter) ?? FIRST_DELAY_MS * 2 ** state.givenUpRun,
    );
    const now = Date.now();
    const pausedUntil = Math.max(state.pausedUntil, now + delayMs);
    state.cooldownMs += pausedUntil - Math.max(now, state.pausedUntil);
    state.pausedUntil = pausedUntil;
    await save();
  };
  return {
    async ready() {
      while (!stopped()) {
        await checkpoint;
        const now = Date.now();
        const readyAt = Math.max(state.pausedUntil, state.nextRequestAt);
        if (now >= deadlineAt || readyAt >= deadlineAt) return false;
        if (readyAt <= now) {
          // Reserve synchronously: waiters waking together must take turns.
          state.nextRequestAt = now + state.intervalMs;
          return true;
        }
        await new Promise((resolve) => setTimeout(resolve, readyAt - now));
      }
      return false;
    },
    async backoff(url, retryAfter) {
      const count = (state.refusals[url] ?? 0) + 1;
      await pause(url, count, retryAfter);
      return !stopped() && count <= MAX_429_RETRIES;
    },
    async refuse(url, retryAfter) {
      await pause(url, MAX_429_RETRIES + 1, retryAfter);
    },
    async recovered(url) {
      state.served += 1;
      delete state.refusals[url];
      const normalPace =
        state.served >= RECOVERY_PAGES && state.intervalMs > MIN_INTERVAL_MS;
      if (normalPace) state.intervalMs = MIN_INTERVAL_MS;
      if (state.givenUpRun === 0 && !normalPace) return;
      state.givenUpRun = 0;
      await save();
    },
    get checkpointFailed() {
      return checkpointFailed;
    },
    get stopped() {
      return stopped();
    },
    get state() {
      return snapshot();
    },
  };
}

/** Resolves true after waiting out a 429, false once the run's budget is spent. */
export type RateLimitWait = (response: Response) => Promise<boolean>;

/**
 * One discovery run's shared wait on 429s. A refused robots.txt or sitemap is
 * retried once after the server's Retry-After. Refusals that arrive together
 * share one pause, and the run waits at most DISCOVERY_WAIT_BUDGET_MS in all
 * so the discovery step keeps to its timeout. Before this, a sitemap shard
 * refused at first contact was silently dropped with every URL in it, and a
 * refused robots.txt read as "everything allowed".
 */
export function createRateLimitWait(): RateLimitWait {
  let pausedUntil = 0;
  let waitedMs = 0;
  return async (response) => {
    const now = Date.now();
    const delayMs = Math.min(
      parseRetryAfterMs(response.headers.get("retry-after")) ??
        DISCOVERY_WAIT_MS,
      DISCOVERY_WAIT_MS,
    );
    const until = Math.max(pausedUntil, now + delayMs);
    const added = until - Math.max(now, pausedUntil);
    if (waitedMs + added > DISCOVERY_WAIT_BUDGET_MS) return false;
    waitedMs += added;
    pausedUntil = until;
    await response.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, until - now));
    return true;
  };
}
