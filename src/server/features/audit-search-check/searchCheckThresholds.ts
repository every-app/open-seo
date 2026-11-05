import type { GscDateRange } from "@/server/features/gsc/searchAnalytics";

/** Search Console window used when the caller doesn't pick one. Three months
 *  smooths out week-to-week noise without keeping pages that stopped ranking. */
export const DEFAULT_DATE_RANGE: GscDateRange = "last_3_months";

/** A page counts as having search demand once it earned this many impressions
 *  in the window. Filters out one-off long-tail impressions. */
export const DEFAULT_MIN_IMPRESSIONS = 10;

/** How many uncrawled pages get a URL Inspection by default. Inspection is
 *  free but quota-limited (about 2,000 per property per day), and each call
 *  adds latency. */
export const DEFAULT_MAX_INSPECTIONS = 20;

/** Hard ceiling on `maxInspections`, so one call can't burn the daily quota. */
export const MAX_INSPECTIONS_CAP = 50;

/** A noindexed page is a critical finding only with this many impressions in the
 *  window (or when it is a tracked ranking URL). Below that, noindex is more
 *  often deliberate than a mistake, so it is a warning. */
export const NOINDEX_CRITICAL_IMPRESSIONS = 100;

/** How many `search-page-not-crawled` findings are returned in full by default.
 *  Sites can have hundreds (a glossary, a blog archive); the rest are grouped
 *  by folder in the summary so one call stays readable. */
export const DEFAULT_MAX_NOT_CRAWLED_SHOWN = 25;

/** Hard ceiling on `maxNotCrawled`, to keep the result a reasonable size. */
export const MAX_NOT_CRAWLED_SHOWN_CAP = 200;
