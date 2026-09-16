import { createServerFn } from "@tanstack/react-start";
import {
  BingNotConnectedError,
  BingService,
  isExpectedKeyFailure,
} from "@/server/features/bing/services/BingService";
import {
  buildStrikingDistanceRows,
  currentPeriodTotals,
  previousPeriodTotals,
  toDailyRows,
  toPageRows,
  toQueryRows,
} from "@/server/features/bing/bingPerformanceReport";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  bingPerformanceTableExportInputSchema,
  projectScopedBingSchema,
} from "@/types/schemas/bing-performance";

/** Not connected, or a dead/revoked key: the page renders the connect card.
 *  Anything else (429, 5xx) is a real fault. Mirrors
 *  isExpectedConnectionFailure in searchPerformance.ts. */
function isExpectedConnectionFailure(error: unknown): boolean {
  return error instanceof BingNotConnectedError || isExpectedKeyFailure(error);
}

/**
 * The Bing Insights overview: current/previous-period totals (split from
 * Bing's one fixed window — see previousPeriodTotals), the striking-distance
 * rows, and the full query/page rows the table tabs slice client-side. Bing
 * gives no server-side pagination or row limit on these endpoints, so unlike
 * GSC Insights the tables paginate over an already-fetched array rather than
 * re-querying per page. All first-party Bing data, free.
 */
export const getBingPerformanceReport = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedBingSchema)
  .handler(async ({ context }) => {
    try {
      const result = await BingService.getPerformance({
        projectId: context.projectId,
      });
      const daily = toDailyRows(result.daily);
      const queries = toQueryRows(result.queries);
      const pages = toPageRows(result.pages);

      return {
        connected: true as const,
        siteUrl: result.siteUrl,
        totals: currentPeriodTotals(daily),
        prevTotals: previousPeriodTotals(daily),
        daily,
        strikingDistance: buildStrikingDistanceRows(result.queries),
        queries,
        pages,
      };
    } catch (error) {
      if (isExpectedConnectionFailure(error)) {
        return { connected: false as const };
      }
      throw error;
    }
  });

/** The full queries/pages dataset for CSV/Sheets export. Also doubles as the
 *  table tabs' source: getBingPerformanceReport already returns every row
 *  (Bing gives no server-side pagination on these endpoints), so the page
 *  paginates client-side over that array and only refetches the full set
 *  here for a fresh export. */
export const exportBingPerformanceTable = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(bingPerformanceTableExportInputSchema)
  .handler(async ({ data, context }) => {
    const result = await BingService.getPerformance({
      projectId: context.projectId,
    });
    // A discriminated union (not a shared `rows` field with a ternary type)
    // so the client can narrow on `dimension` without an unsafe cast.
    return data.dimension === "query"
      ? { dimension: "query" as const, rows: toQueryRows(result.queries) }
      : { dimension: "page" as const, rows: toPageRows(result.pages) };
  });
