import { createServerFn } from "@tanstack/react-start";
import {
  GscNotConnectedError,
  GscService,
  isExpectedGrantFailure,
} from "@/server/features/gsc/services/GscService";
import {
  resolveDateRange,
  type GscDimension,
  type GscPerformanceFilter,
} from "@/server/features/gsc/searchAnalytics";
import {
  buildClickChanges,
  buildDailyTrend,
  buildStrikingDistanceRows,
  previousClicksLookup,
  previousPeriod,
  sumSearchTotals,
  toDimensionRows,
} from "@/server/features/gsc/searchPerformanceReport";
import { requireProjectContext } from "@/serverFunctions/middleware";
import type { GscBrandedClassification } from "@/shared/gsc";
import {
  type SearchPerformanceType,
  searchPerformanceDetailInputSchema,
  searchPerformanceDimensionInputSchema,
  searchPerformanceInputSchema,
  searchPerformanceTableInputSchema,
} from "@/types/schemas/search-performance";

// query x page fan-out needs more rows to find the 5..20 band.
const STRIKING_DISTANCE_FETCH_LIMIT = 1000;
// dimensions:["date"] returns one row per day; the longest range is ~92 days.
const DAILY_ROW_LIMIT = 200;
const COUNTRY_ROW_LIMIT = 25;
// Export pulls the whole dimension in one shot, capped at GSC's per-call max
// (GSC_MAX_ROW_LIMIT). Large stores get everything up to this ceiling.
const EXPORT_ROW_LIMIT = 1000;
// Each period's top rows by clicks, compared to find what changed.
const COMPARISON_ROW_LIMIT = 1000;
const RELATED_ROW_LIMIT = 10;

/** Build the GSC filters shared by every call. `omit` drops one dimension's
 *  filter, for the breakdown of that same dimension (so the country dropdown
 *  keeps every option visible while one country is selected). Google rejects a
 *  device filter on Discover, so a leftover device in an old link is dropped
 *  there. */
function buildGscFilters(
  data: {
    searchType: SearchPerformanceType;
    device?: string;
    country?: string;
    brand?: GscBrandedClassification;
    pageFilter?: { operator: "contains" | "equals"; expression: string };
    queryFilter?: { operator: "contains" | "equals"; expression: string };
  },
  omit?: GscDimension,
): GscPerformanceFilter[] {
  const filters: GscPerformanceFilter[] = [];
  if (data.device && data.searchType !== "discover")
    filters.push({
      dimension: "device",
      operator: "equals",
      expression: data.device,
    });
  if (data.pageFilter) filters.push({ dimension: "page", ...data.pageFilter });
  // Discover and Google News have no queries to filter or classify. Google
  // can't combine the brand split with a query filter, so a query filter (a
  // detail sheet's own query among them) takes its place.
  if (data.searchType === "web") {
    if (data.queryFilter)
      filters.push({ dimension: "query", ...data.queryFilter });
    else if (data.brand)
      filters.push({
        dimension: "brandedClassification",
        operator: "equals",
        expression: data.brand,
      });
  }
  if (data.country)
    filters.push({
      dimension: "country",
      operator: "equals",
      expression: data.country,
    });
  return omit ? filters.filter((filter) => filter.dimension !== omit) : filters;
}

/** Not connected, or a dead/denied grant (token failure or 401/403): the page
 *  renders the connect card. Other statuses (429, 5xx) are real faults. */
function isExpectedConnectionFailure(error: unknown): boolean {
  return error instanceof GscNotConnectedError || isExpectedGrantFailure(error);
}

/**
 * The Search Performance overview: current + previous-period totals, the
 * striking-distance rows, and the country list that powers the filter dropdown.
 * The queries/pages tables paginate separately (getSearchPerformanceTable) so
 * page-flips never re-run the striking-distance scan. All first-party GSC data,
 * free.
 */
export const getSearchPerformanceReport = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(searchPerformanceInputSchema)
  .handler(async ({ data, context }) => {
    const { startDate, endDate } = resolveDateRange({
      dateRange: data.dateRange,
    });
    const prev = previousPeriod(startDate, endDate);
    const projectId = context.projectId;
    const filters = buildGscFilters(data);
    const type = data.searchType;

    try {
      const [current, previous, queryPages, countries, brands] =
        await Promise.all([
          GscService.getPerformance({
            projectId,
            startDate,
            endDate,
            type,
            dimensions: ["date"],
            filters,
            rowLimit: DAILY_ROW_LIMIT,
          }),
          GscService.getPerformance({
            projectId,
            startDate: prev.startDate,
            endDate: prev.endDate,
            type,
            dimensions: ["date"],
            filters,
            rowLimit: DAILY_ROW_LIMIT,
          }),
          // Striking distance needs queries and positions, which only web has.
          type === "web"
            ? GscService.getPerformance({
                projectId,
                startDate,
                endDate,
                type,
                dimensions: ["query", "page"],
                filters,
                rowLimit: STRIKING_DISTANCE_FETCH_LIMIT,
              })
            : { rows: [] },
          GscService.getPerformance({
            projectId,
            startDate,
            endDate,
            type,
            dimensions: ["country"],
            filters: buildGscFilters(data, "country"),
            rowLimit: COUNTRY_ROW_LIMIT,
          }),
          // Google classifies web queries only, and not under a query filter.
          type === "web" && !data.queryFilter
            ? GscService.getPerformance({
                projectId,
                startDate,
                endDate,
                type,
                dimensions: ["brandedClassification"],
                filters: buildGscFilters(data, "brandedClassification"),
              })
            : null,
        ]);

      return {
        connected: true as const,
        range: {
          startDate,
          endDate,
          prevStartDate: prev.startDate,
          prevEndDate: prev.endDate,
        },
        totals: sumSearchTotals(current.rows),
        prevTotals: sumSearchTotals(previous.rows),
        trend: buildDailyTrend(current.rows, startDate, endDate),
        prevTrend: buildDailyTrend(previous.rows, prev.startDate, prev.endDate),
        strikingDistance: buildStrikingDistanceRows(queryPages.rows),
        countries: toDimensionRows(countries.rows),
        // Google returns no rows for properties it doesn't classify by brand.
        brandClassified: brands ? brands.rows.length > 0 : null,
      };
    } catch (error) {
      if (isExpectedConnectionFailure(error)) {
        return { connected: false as const };
      }
      throw error;
    }
  });

/**
 * One page of the queries or pages table, paginated server-side against GSC via
 * `startRow` so it scales to large properties. GSC returns no total count, so we
 * fetch one extra row to detect a next page. Each row also carries its clicks
 * in the previous period. All first-party GSC data, free.
 */
export const getSearchPerformanceTable = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(searchPerformanceTableInputSchema)
  .handler(async ({ data, context }) => {
    const { startDate, endDate } = resolveDateRange({
      dateRange: data.dateRange,
    });
    const prev = previousPeriod(startDate, endDate);
    const filters = buildGscFilters(data);
    const offset = (data.page - 1) * data.pageSize;
    const dimension = {
      projectId: context.projectId,
      type: data.searchType,
      dimensions: [data.dimension],
      filters,
    };

    try {
      const [result, previous] = await Promise.all([
        GscService.getPerformance({
          ...dimension,
          startDate,
          endDate,
          // One extra row tells us whether a further page exists.
          rowLimit: data.pageSize + 1,
          startRow: offset,
        }),
        GscService.getPerformance({
          ...dimension,
          startDate: prev.startDate,
          endDate: prev.endDate,
          rowLimit: COMPARISON_ROW_LIMIT,
        }),
      ]);

      const previousClicks = previousClicksLookup(
        previous.rows,
        COMPARISON_ROW_LIMIT,
      );
      const fetched = toDimensionRows(result.rows).map((row) => ({
        ...row,
        prevClicks: previousClicks(row.key),
      }));
      const hasNextPage = fetched.length > data.pageSize;
      const rows = hasNextPage ? fetched.slice(0, data.pageSize) : fetched;

      return {
        connected: true as const,
        dimension: data.dimension,
        page: data.page,
        pageSize: data.pageSize,
        hasNextPage,
        totalCount:
          !hasNextPage && (offset === 0 || rows.length > 0)
            ? offset + rows.length
            : null,
        rows,
      };
    } catch (error) {
      if (isExpectedConnectionFailure(error)) {
        return { connected: false as const };
      }
      throw error;
    }
  });

/**
 * The full queries/pages dataset for CSV/Sheets export (capped at
 * EXPORT_ROW_LIMIT), rather than only the visible page.
 */
export const exportSearchPerformanceTable = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(searchPerformanceDimensionInputSchema)
  .handler(async ({ data, context }) => {
    const { startDate, endDate } = resolveDateRange({
      dateRange: data.dateRange,
    });
    const filters = buildGscFilters(data);

    const result = await GscService.getPerformance({
      projectId: context.projectId,
      startDate,
      endDate,
      type: data.searchType,
      dimensions: [data.dimension],
      filters,
      rowLimit: EXPORT_ROW_LIMIT,
    });

    return {
      dimension: data.dimension,
      rows: toDimensionRows(result.rows),
    };
  });

/**
 * The queries or pages that gained and lost the most clicks against the
 * previous period, under the page's filters.
 */
export const getSearchPerformanceChanges = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(searchPerformanceDimensionInputSchema)
  .handler(async ({ data, context }) => {
    const { startDate, endDate } = resolveDateRange({
      dateRange: data.dateRange,
    });
    const prev = previousPeriod(startDate, endDate);
    const filters = buildGscFilters(data);
    const dimension = {
      projectId: context.projectId,
      type: data.searchType,
      dimensions: [data.dimension],
      filters,
      rowLimit: COMPARISON_ROW_LIMIT,
    };

    try {
      const [current, previous] = await Promise.all([
        GscService.getPerformance({ ...dimension, startDate, endDate }),
        GscService.getPerformance({
          ...dimension,
          startDate: prev.startDate,
          endDate: prev.endDate,
        }),
      ]);
      return {
        connected: true as const,
        ...buildClickChanges(current.rows, previous.rows, COMPARISON_ROW_LIMIT),
      };
    } catch (error) {
      if (isExpectedConnectionFailure(error)) {
        return { connected: false as const };
      }
      throw error;
    }
  });

/**
 * One query or page under the page's filters: its totals and daily trend for
 * both periods, and the pages that rank for the query (or the queries the page
 * ranks for). Discover and Google News have no queries, so nothing related.
 */
export const getSearchPerformanceDetail = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(searchPerformanceDetailInputSchema)
  .handler(async ({ data, context }) => {
    const { startDate, endDate } = resolveDateRange({
      dateRange: data.dateRange,
    });
    const prev = previousPeriod(startDate, endDate);
    // The row's own key replaces any text filter on its dimension.
    const key = { operator: "equals" as const, expression: data.key };
    const filters = buildGscFilters({
      ...data,
      ...(data.dimension === "page"
        ? { pageFilter: key }
        : { queryFilter: key }),
    });
    const scope = { projectId: context.projectId, type: data.searchType };
    const daily = {
      ...scope,
      dimensions: ["date" as const],
      filters,
      rowLimit: DAILY_ROW_LIMIT,
    };

    try {
      const [current, previous, related] = await Promise.all([
        GscService.getPerformance({ ...daily, startDate, endDate }),
        GscService.getPerformance({
          ...daily,
          startDate: prev.startDate,
          endDate: prev.endDate,
        }),
        data.searchType === "web"
          ? GscService.getPerformance({
              ...scope,
              startDate,
              endDate,
              dimensions: [data.dimension === "page" ? "query" : "page"],
              filters,
              rowLimit: RELATED_ROW_LIMIT,
            })
          : { rows: [] },
      ]);
      return {
        connected: true as const,
        totals: sumSearchTotals(current.rows),
        prevTotals: sumSearchTotals(previous.rows),
        trend: buildDailyTrend(current.rows, startDate, endDate),
        prevTrend: buildDailyTrend(previous.rows, prev.startDate, prev.endDate),
        related: toDimensionRows(related.rows),
      };
    } catch (error) {
      if (isExpectedConnectionFailure(error)) {
        return { connected: false as const };
      }
      throw error;
    }
  });
