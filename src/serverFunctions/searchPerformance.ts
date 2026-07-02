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
import { requireProjectContext } from "@/serverFunctions/middleware";
import { searchPerformanceInputSchema } from "@/types/schemas/search-performance";

const TABLE_ROW_LIMIT = 250;
// query x page fan-out needs more rows to find the 5..20 band.
const STRIKING_DISTANCE_FETCH_LIMIT = 1000;
// dimensions:["date"] returns one row per day; the longest range is ~92 days.
const DAILY_ROW_LIMIT = 200;
const COUNTRY_ROW_LIMIT = 25;

/**
 * Everything the Search Performance page renders, in one call: current and
 * previous-period totals, top queries/pages, the striking-distance rows, and
 * the country list that powers the filter dropdown. The six GSC queries run
 * in parallel against the project's connected property and cost nothing
 * (first-party Search Console data).
 */
export const getSearchPerformanceReport = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => searchPerformanceInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { startDate, endDate } = resolveDateRange({
      dateRange: data.dateRange,
    });
    const prev = previousPeriod(startDate, endDate);
    const projectId = context.projectId;

    // Device applies everywhere; country applies everywhere EXCEPT the
    // country breakdown itself, so the dropdown keeps every option visible
    // while one country is selected.
    const deviceFilters: GscPerformanceFilter[] = data.device
      ? [{ dimension: "device", operator: "equals", expression: data.device }]
      : [];
    const filters: GscPerformanceFilter[] = data.country
      ? [
          ...deviceFilters,
          {
            dimension: "country",
            operator: "equals",
            expression: data.country,
          },
        ]
      : deviceFilters;

    try {
      const [current, previous, queries, pages, queryPages, countries] =
        await Promise.all([
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
            dimensions: ["query"],
            filters,
            rowLimit: TABLE_ROW_LIMIT,
          }),
          GscService.getPerformance({
            projectId,
            startDate,
            endDate,
            dimensions: ["page"],
            filters,
            rowLimit: TABLE_ROW_LIMIT,
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
        range: {
          startDate,
          endDate,
          prevStartDate: prev.startDate,
          prevEndDate: prev.endDate,
        },
        totals: sumSearchTotals(current.rows),
        prevTotals: sumSearchTotals(previous.rows),
        queries: toDimensionRows(queries.rows),
        pages: toDimensionRows(pages.rows),
        strikingDistance: buildStrikingDistanceRows(queryPages.rows),
        countries: toDimensionRows(countries.rows),
      };
    } catch (error) {
      // Not connected, or a dead/denied grant (token failure or 401/403): the
      // page renders the connect card, which surfaces the reconnect prompt.
      // Other statuses (429, 5xx) are real faults and go through error handling.
      if (
        error instanceof GscNotConnectedError ||
        isExpectedGrantFailure(error)
      ) {
        return { connected: false as const };
      }
      throw error;
    }
  });
