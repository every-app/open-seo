import { createServerFn } from "@tanstack/react-start";
import {
  GscNotConnectedError,
  GscService,
  isExpectedGrantFailure,
} from "@/server/features/gsc/services/GscService";
import {
  resolveDateRange,
  type GscPerformanceFilter,
} from "@/server/features/gsc/searchAnalytics";
import {
  buildStrikingDistanceRows,
  previousPeriod,
  sumSearchTotals,
  toDimensionRows,
} from "@/server/features/gsc/searchPerformanceReport";
import {
  filterDimensionRowsByMetrics,
  filterStrikingDistanceByMetrics,
  normalizePagePathFilter,
  paginateRows,
  toPagePathGscFilter,
} from "@/server/features/gsc/searchPerformanceFilters";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  hasActiveMetricFilters,
  searchPerformanceInputSchema,
  searchPerformanceTableExportInputSchema,
  searchPerformanceTableInputSchema,
  SEARCH_PERFORMANCE_METRIC_FILTER_ROW_LIMIT,
  type SearchPerformanceDateRange,
  type SearchPerformanceMetricFilters,
  type SearchPerformanceTableDimension,
} from "@/types/schemas/search-performance";

// query x page fan-out needs more rows to find the 5..20 band.
const STRIKING_DISTANCE_FETCH_LIMIT = 1000;
// dimensions:["date"] returns one row per day; the longest range is ~92 days.
const DAILY_ROW_LIMIT = 200;
const COUNTRY_ROW_LIMIT = 25;
// Export pulls the whole dimension in one shot, capped at GSC's per-call max
// (GSC_MAX_ROW_LIMIT). Large stores get everything up to this ceiling.
const EXPORT_ROW_LIMIT = SEARCH_PERFORMANCE_METRIC_FILTER_ROW_LIMIT;

/** Build GSC filter groups shared by every call. Device applies everywhere;
 *  country applies everywhere except the country breakdown itself (so the
 *  dropdown keeps every option visible while one country is selected).
 *  Page path applies as a `page` contains filter when set. */
function buildGscFilters(data: {
  device?: string;
  country?: string;
  pagePath?: string;
}): {
  deviceFilters: GscPerformanceFilter[];
  filters: GscPerformanceFilter[];
} {
  const deviceFilters: GscPerformanceFilter[] = data.device
    ? [{ dimension: "device", operator: "equals", expression: data.device }]
    : [];
  const pagePath = normalizePagePathFilter(data.pagePath);
  const pageFilters: GscPerformanceFilter[] = pagePath
    ? [toPagePathGscFilter(pagePath)]
    : [];
  const filters: GscPerformanceFilter[] = data.country
    ? [
        ...deviceFilters,
        ...pageFilters,
        { dimension: "country", operator: "equals", expression: data.country },
      ]
    : [...deviceFilters, ...pageFilters];
  return { deviceFilters, filters };
}

async function fetchFilteredDimensionRows(
  data: SearchPerformanceMetricFilters & {
    dateRange: SearchPerformanceDateRange;
    dimension: SearchPerformanceTableDimension;
    device?: string;
    country?: string;
  },
  contextProjectId: string,
) {
  const { startDate, endDate } = resolveDateRange({
    dateRange: data.dateRange,
  });
  const { filters } = buildGscFilters(data);
  const result = await GscService.getPerformance({
    projectId: contextProjectId,
    startDate,
    endDate,
    dimensions: [data.dimension],
    filters,
    rowLimit: EXPORT_ROW_LIMIT,
  });
  return filterDimensionRowsByMetrics(toDimensionRows(result.rows), data);
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
    const { deviceFilters, filters } = buildGscFilters(data);
    const metricFiltersActive = hasActiveMetricFilters(data);

    try {
      const [current, previous, queryPages, countries] = await Promise.all([
        GscService.getPerformance({
          projectId,
          startDate,
          endDate,
          dimensions: ["date"],
          filters,
          rowLimit: DAILY_ROW_LIMIT,
        }),
        GscService.getPerformance({
          projectId,
          startDate: prev.startDate,
          endDate: prev.endDate,
          dimensions: ["date"],
          filters,
          rowLimit: DAILY_ROW_LIMIT,
        }),
        GscService.getPerformance({
          projectId,
          startDate,
          endDate,
          dimensions: ["query", "page"],
          filters,
          rowLimit: STRIKING_DISTANCE_FETCH_LIMIT,
        }),
        GscService.getPerformance({
          projectId,
          startDate,
          endDate,
          dimensions: ["country"],
          filters: deviceFilters,
          rowLimit: COUNTRY_ROW_LIMIT,
        }),
      ]);

      return {
        connected: true as const,
        metricFiltersActive,
        range: {
          startDate,
          endDate,
          prevStartDate: prev.startDate,
          prevEndDate: prev.endDate,
        },
        totals: sumSearchTotals(current.rows),
        prevTotals: sumSearchTotals(previous.rows),
        strikingDistance: filterStrikingDistanceByMetrics(
          buildStrikingDistanceRows(queryPages.rows),
          data,
        ),
        countries: toDimensionRows(countries.rows),
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
 * fetch one extra row to detect a next page. All first-party GSC data, free.
 */
export const getSearchPerformanceTable = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(searchPerformanceTableInputSchema)
  .handler(async ({ data, context }) => {
    const { startDate, endDate } = resolveDateRange({
      dateRange: data.dateRange,
    });
    const { filters } = buildGscFilters(data);

    try {
      if (hasActiveMetricFilters(data)) {
        const filteredRows = await fetchFilteredDimensionRows(
          data,
          context.projectId,
        );
        const { rows, hasNextPage } = paginateRows(
          filteredRows,
          data.page,
          data.pageSize,
        );

        return {
          connected: true as const,
          dimension: data.dimension,
          page: data.page,
          pageSize: data.pageSize,
          hasNextPage,
          rows,
        };
      }

      const offset = (data.page - 1) * data.pageSize;

      const result = await GscService.getPerformance({
        projectId: context.projectId,
        startDate,
        endDate,
        dimensions: [data.dimension],
        filters,
        // One extra row tells us whether a further page exists.
        rowLimit: data.pageSize + 1,
        startRow: offset,
      });

      const fetched = toDimensionRows(result.rows);
      const hasNextPage = fetched.length > data.pageSize;
      const rows = hasNextPage ? fetched.slice(0, data.pageSize) : fetched;

      return {
        connected: true as const,
        dimension: data.dimension,
        page: data.page,
        pageSize: data.pageSize,
        hasNextPage,
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
  .validator(searchPerformanceTableExportInputSchema)
  .handler(async ({ data, context }) => {
    const filteredRows = await fetchFilteredDimensionRows(
      data,
      context.projectId,
    );

    return {
      dimension: data.dimension,
      rows: filteredRows,
    };
  });
