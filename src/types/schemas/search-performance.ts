import { z } from "zod";

/** Date ranges offered by the Search Performance page. A deliberate subset of
 *  the GSC agent ranges (GSC_DATE_RANGES in searchAnalytics.ts); assignability
 *  to GscDateRange is compiler-checked at the resolveDateRange call site. */
export const SEARCH_PERFORMANCE_RANGES = [
  "last_7_days",
  "last_28_days",
  "last_3_months",
] as const;

/** Device values exactly as the GSC `device` dimension returns/accepts them. */
export const GSC_DEVICES = ["DESKTOP", "MOBILE", "TABLET"] as const;

export type SearchPerformanceDateRange =
  (typeof SEARCH_PERFORMANCE_RANGES)[number];
export type SearchPerformanceDevice = (typeof GSC_DEVICES)[number];

const optionalNonNegativeInt = z.number().int().nonnegative().optional();
const optionalPositiveNumber = z.number().positive().optional();

function refineMetricRanges(
  data: {
    minImpressions?: number;
    maxImpressions?: number;
    minClicks?: number;
    maxClicks?: number;
    minPosition?: number;
    maxPosition?: number;
  },
  ctx: z.RefinementCtx,
) {
  const pairs: [keyof typeof data, keyof typeof data, string][] = [
    ["minImpressions", "maxImpressions", "Impressions"],
    ["minClicks", "maxClicks", "Clicks"],
    ["minPosition", "maxPosition", "Position"],
  ];
  for (const [minKey, maxKey, label] of pairs) {
    const min = data[minKey];
    const max = data[maxKey];
    if (min !== undefined && max !== undefined && min > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} minimum cannot exceed maximum`,
        path: [minKey],
      });
    }
  }
}

const optionalPagePath = z
  .string()
  .transform((value) => value.trim())
  .transform((value) => (value.length > 0 ? value : undefined))
  .optional();

// Shared report/table filters. Spread into each request schema so the overview
// and the paginated table calls always accept the exact same filter surface.
const searchPerformanceMetricFilterShape = {
  pagePath: optionalPagePath,
  excludePagePath: optionalPagePath,
  minImpressions: optionalNonNegativeInt,
  maxImpressions: optionalNonNegativeInt,
  minClicks: optionalNonNegativeInt,
  maxClicks: optionalNonNegativeInt,
  minPosition: optionalPositiveNumber,
  maxPosition: optionalPositiveNumber,
};

const searchPerformanceFilterShape = {
  projectId: z.string().min(1),
  dateRange: z.enum(SEARCH_PERFORMANCE_RANGES).default("last_28_days"),
  device: z.enum(GSC_DEVICES).optional(),
  // ISO-3166-1 alpha-3, the code GSC returns in `country` dimension keys.
  country: z
    .string()
    .length(3)
    .transform((value) => value.toLowerCase())
    .optional(),
  ...searchPerformanceMetricFilterShape,
};

const searchPerformanceMetricFilterSchema = z.object(
  searchPerformanceMetricFilterShape,
);

export type SearchPerformanceMetricFilters = z.infer<
  typeof searchPerformanceMetricFilterSchema
>;

export function hasActiveMetricFilters(
  filters: SearchPerformanceMetricFilters,
): boolean {
  return (
    filters.minImpressions !== undefined ||
    filters.maxImpressions !== undefined ||
    filters.minClicks !== undefined ||
    filters.maxClicks !== undefined ||
    filters.minPosition !== undefined ||
    filters.maxPosition !== undefined
  );
}

export const searchPerformanceInputSchema = z
  .object(searchPerformanceFilterShape)
  .superRefine(refineMetricRanges);

/** The dimensions that get their own paginated table (query + page). Striking
 *  distance is computed from the overview call and never paginates. */
export const SEARCH_PERFORMANCE_TABLE_DIMENSIONS = ["query", "page"] as const;
export type SearchPerformanceTableDimension =
  (typeof SEARCH_PERFORMANCE_TABLE_DIMENSIONS)[number];

export const SEARCH_PERFORMANCE_PAGE_SIZES = [25, 50, 100] as const;
export const SEARCH_PERFORMANCE_DEFAULT_PAGE_SIZE = 25;
/** Max GSC rows fetched before in-app metric filtering and pagination. */
export const SEARCH_PERFORMANCE_METRIC_FILTER_ROW_LIMIT = 1000;

export const searchPerformanceTableInputSchema = z
  .object({
    ...searchPerformanceFilterShape,
    dimension: z.enum(SEARCH_PERFORMANCE_TABLE_DIMENSIONS),
    page: z.number().int().positive().default(1),
    pageSize: z
      .number()
      .int()
      .refine((value) =>
        (SEARCH_PERFORMANCE_PAGE_SIZES as readonly number[]).includes(value),
      )
      .default(SEARCH_PERFORMANCE_DEFAULT_PAGE_SIZE),
  })
  .superRefine(refineMetricRanges);

/** Export pulls the full dataset (capped) rather than a single page. */
export const searchPerformanceTableExportInputSchema = z
  .object({
    ...searchPerformanceFilterShape,
    dimension: z.enum(SEARCH_PERFORMANCE_TABLE_DIMENSIONS),
  })
  .superRefine(refineMetricRanges);
