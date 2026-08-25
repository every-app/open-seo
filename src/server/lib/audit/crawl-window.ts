import type { CrawledPageResult } from "@/server/lib/audit/types";

/**
 * Rolling fetch-concurrency window for the crawl. Unlike fixed batches, a
 * slow page only occupies one slot instead of stalling a whole batch. The
 * window adapts to the site: it shrinks when fetches error/block/crawl
 * slowly (politeness toward struggling or defensive sites) and grows when
 * the site answers fast.
 */
interface CrawlWindowLimits {
  /** Window size a chunk starts with, before any observations. */
  initial: number;
  min: number;
  max: number;
  /**
   * Total HTML the in-flight window may buffer at once. Each in-flight page
   * holds its body (decoded to a UTF-16 string, roughly doubling it), and the
   * workflow shares its isolate's 128 MB memory limit with the rest of the
   * worker — production audits died with exceededMemory when a fast site let
   * the window grow unchecked.
   */
  budgetBytes: number;
}

export const CRAWL_WINDOW: CrawlWindowLimits = {
  initial: 10,
  min: 5,
  max: 20,
  budgetBytes: 8 * 1024 * 1024,
};

/**
 * Limits for a chunk whose earlier attempt died mid-crawl — in production
 * almost always exceededMemory on a heavy-page site. The retry is the
 * chunk's last attempt (retry limit 1), so it must not re-run the exact
 * memory profile that just killed the isolate.
 */
export const RETRY_CRAWL_WINDOW: CrawlWindowLimits = {
  initial: 3,
  min: 2,
  max: 5,
  budgetBytes: 4 * 1024 * 1024,
};

const SLOW_RESPONSE_MS = 10_000;
const FAST_RESPONSE_MS = 1_500;
/** Floor for the observed page size so tiny-page sites can't void the bound. */
const MIN_ASSUMED_PAGE_BYTES = 64 * 1024;
/**
 * Growth requires a full-size sample. The first persist sub-batch is small
 * (so the byte bound reacts to heavy pages early), and a handful of fast
 * pages proves too little to widen the window.
 */
const GROWTH_MIN_SAMPLE = 25;

export function clampCrawlWindow(
  size: number,
  limits: CrawlWindowLimits,
): number {
  return Math.min(Math.max(size, limits.min), limits.max);
}

/**
 * Adapt the window to the last persisted sub-batch. Shrinks on trouble
 * (errors, blocks, very slow responses), grows only on a clean, mostly fast,
 * full-size batch, and is always capped so the batch's average page size
 * times the window stays inside the in-flight byte budget.
 */
export function adjustCrawlWindow(
  windowSize: number,
  recent: CrawledPageResult[],
  limits: CrawlWindowLimits = CRAWL_WINDOW,
): number {
  if (recent.length === 0) return windowSize;
  const troubled = recent.filter(
    (page) =>
      page.fetchClass !== "ok" ||
      (page.responseTimeMs ?? 0) >= SLOW_RESPONSE_MS,
  ).length;
  let next = windowSize;
  if (troubled * 3 >= recent.length) {
    next = Math.max(limits.min, Math.floor(windowSize / 2));
  } else {
    const fast = recent.filter(
      (page) =>
        page.fetchClass === "ok" &&
        (page.responseTimeMs ?? Infinity) <= FAST_RESPONSE_MS,
    ).length;
    if (
      troubled === 0 &&
      fast * 2 >= recent.length &&
      recent.length >= GROWTH_MIN_SAMPLE
    ) {
      next = Math.min(limits.max, windowSize + 5);
    }
  }

  const avgPageBytes = Math.max(
    recent.reduce((sum, page) => sum + page.htmlBytes, 0) / recent.length,
    MIN_ASSUMED_PAGE_BYTES,
  );
  const byteBound = Math.max(
    limits.min,
    Math.floor(limits.budgetBytes / avgPageBytes),
  );
  return Math.min(next, byteBound);
}
