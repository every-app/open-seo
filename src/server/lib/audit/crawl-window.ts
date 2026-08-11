import type { CrawledPageResult } from "@/server/lib/audit/types";

/**
 * Rolling fetch-concurrency window for the crawl. Unlike fixed batches, a
 * slow page only occupies one slot instead of stalling a whole batch. The
 * window adapts to the site: it shrinks when fetches error/block/crawl
 * slowly (politeness toward struggling or defensive sites) and grows when
 * the site answers fast.
 */
export const INITIAL_CRAWL_WINDOW = 10;
const MIN_WINDOW = 5;
const MAX_WINDOW = 20;
const SLOW_RESPONSE_MS = 10_000;
const FAST_RESPONSE_MS = 1_500;

/**
 * Total HTML the in-flight window may buffer at once. Each in-flight page
 * holds its body (decoded to a UTF-16 string, roughly doubling it), and the
 * workflow shares its isolate's 128 MB memory limit with the rest of the
 * worker — production audits died with exceededMemory when a fast site let
 * the window grow unchecked.
 */
const IN_FLIGHT_HTML_BUDGET_BYTES = 16 * 1024 * 1024;
/** Floor for the observed page size so tiny-page sites can't void the bound. */
const MIN_ASSUMED_PAGE_BYTES = 64 * 1024;

/**
 * Adapt the window to the last persisted sub-batch. Shrinks on trouble
 * (errors, blocks, very slow responses), grows only on a clean and mostly
 * fast batch, and is always capped so the batch's average page size times
 * the window stays inside the in-flight byte budget.
 */
export function adjustCrawlWindow(
  windowSize: number,
  recent: CrawledPageResult[],
): number {
  if (recent.length === 0) return windowSize;
  const troubled = recent.filter(
    (page) =>
      page.fetchClass !== "ok" ||
      (page.responseTimeMs ?? 0) >= SLOW_RESPONSE_MS,
  ).length;
  let next = windowSize;
  if (troubled * 3 >= recent.length) {
    next = Math.max(MIN_WINDOW, Math.floor(windowSize / 2));
  } else {
    const fast = recent.filter(
      (page) =>
        page.fetchClass === "ok" &&
        (page.responseTimeMs ?? Infinity) <= FAST_RESPONSE_MS,
    ).length;
    if (troubled === 0 && fast * 2 >= recent.length) {
      next = Math.min(MAX_WINDOW, windowSize + 5);
    }
  }

  const avgPageBytes = Math.max(
    recent.reduce((sum, page) => sum + page.htmlBytes, 0) / recent.length,
    MIN_ASSUMED_PAGE_BYTES,
  );
  const byteBound = Math.max(
    MIN_WINDOW,
    Math.floor(IN_FLIGHT_HTML_BUDGET_BYTES / avgPageBytes),
  );
  return Math.min(next, byteBound);
}
