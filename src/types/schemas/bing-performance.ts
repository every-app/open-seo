import { z } from "zod";

// Bing gives no date-range/device/country filters on its report endpoints —
// each call returns Bing's own fixed rolling window — so unlike
// search-performance.ts there is no filter shape to share across requests.

export const projectScopedBingSchema = z.object({
  projectId: z.string().min(1),
});

export const saveBingApiKeySchema = z.object({
  apiKey: z.string().min(1),
});

export const setBingSiteSchema = z.object({
  projectId: z.string().min(1),
  siteUrl: z.string().min(1),
});

/** The two dimensions that get their own table (query + page), mirroring
 *  SEARCH_PERFORMANCE_TABLE_DIMENSIONS. Striking distance is computed from
 *  the query stats call and never paginates. */
export const BING_PERFORMANCE_TABLE_DIMENSIONS = ["query", "page"] as const;
export type BingPerformanceTableDimension =
  (typeof BING_PERFORMANCE_TABLE_DIMENSIONS)[number];

export const BING_PERFORMANCE_PAGE_SIZES = [25, 50, 100] as const;
export const BING_PERFORMANCE_DEFAULT_PAGE_SIZE = 25;

export const bingPerformanceTableExportInputSchema = z.object({
  projectId: z.string().min(1),
  dimension: z.enum(BING_PERFORMANCE_TABLE_DIMENSIONS),
});
