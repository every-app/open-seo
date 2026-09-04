export const RETENTION_DRAIN_PAGE_SIZE = 250;
export const RETENTION_DRAIN_MAX_PAGES = 20;

type RetentionPurgePage = {
  deleted: number;
  hasMore: boolean;
};

type RetentionDrainResult = RetentionPurgePage & {
  pages: number;
  stalled: boolean;
};

/**
 * Drains deterministic delete pages up to a fixed per-invocation budget.
 * Deleting from the oldest ordered rows makes a repeated cron/manual call a
 * safe continuation without storing a cursor that could become stale.
 */
export async function drainRetentionPages(input: {
  maxPages?: number;
  purgePage: () => Promise<RetentionPurgePage>;
}): Promise<RetentionDrainResult> {
  const maxPages = input.maxPages ?? RETENTION_DRAIN_MAX_PAGES;
  if (
    !Number.isInteger(maxPages) ||
    maxPages < 1 ||
    maxPages > RETENTION_DRAIN_MAX_PAGES
  ) {
    throw new Error(
      `Retention maxPages must be between 1 and ${RETENTION_DRAIN_MAX_PAGES}.`,
    );
  }

  let deleted = 0;
  let pages = 0;
  let hasMore = false;
  let stalled = false;
  while (pages < maxPages) {
    const page = await input.purgePage();
    pages += 1;
    deleted += page.deleted;
    hasMore = page.hasMore;
    if (!hasMore) break;
    if (page.deleted === 0) {
      // Preserve hasMore so monitoring/manual callers know continuation is
      // required, while preventing a contention race from spinning in-place.
      stalled = true;
      break;
    }
  }
  return { deleted, pages, hasMore, stalled };
}
