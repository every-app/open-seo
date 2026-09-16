import { sort } from "remeda";
import { parseBingDate } from "@/shared/bing";
import type {
  BingPageStatsRow,
  BingQueryStatsRow,
  BingRankAndTrafficStatsRow,
} from "@/server/lib/bingWebmasterClient";

/**
 * Pure shaping helpers for the Bing Insights page. Kept separate from the
 * server function so aggregation and the striking-distance rule are unit
 * testable without a Bing client.
 *
 * Unlike GSC, Bing gives no start/end date parameters — `GetRankAndTrafficStats`
 * always returns its own fixed rolling window. So there is no "date range"
 * filter on this page; totals/trend/striking-distance are always computed over
 * whatever window Bing hands back.
 */

type BingTotals = {
  clicks: number;
  impressions: number;
  /** 0..1 (clicks / impressions). */
  ctr: number;
};

type BingDailyRow = {
  date: string;
  clicks: number;
  impressions: number;
};

type BingQueryRow = {
  query: string;
  clicks: number;
  impressions: number;
  avgClickPosition: number;
  avgImpressionPosition: number;
};

type BingPageRow = {
  page: string;
  /** `GetPageStats` returns (query, page) pairs with no click/impression
   *  counts of its own, so the only honest metric here is how many distinct
   *  queries surfaced this page. */
  queryCount: number;
};

type BingStrikingDistanceRow = {
  query: string;
  clicks: number;
  impressions: number;
  avgImpressionPosition: number;
};

// Same band as the GSC Insights page: already ranking, not yet top-of-page.
const STRIKING_DISTANCE_MIN_POSITION = 5;
const STRIKING_DISTANCE_MAX_POSITION = 20;
const STRIKING_DISTANCE_ROW_LIMIT = 100;

/** Parse and sort `GetRankAndTrafficStats` rows into daily totals. Rows with
 *  an unparseable `Date` are dropped rather than throwing — one bad row
 *  shouldn't fail the whole report. */
export function toDailyRows(
  rows: BingRankAndTrafficStatsRow[],
): BingDailyRow[] {
  const output: BingDailyRow[] = [];
  for (const row of rows) {
    const date = parseBingDate(row.Date);
    if (!date) continue;
    output.push({ date, clicks: row.Clicks, impressions: row.Impressions });
  }
  return sort(output, (a, b) => a.date.localeCompare(b.date));
}

export function sumBingTotals(rows: BingDailyRow[]): BingTotals {
  let clicks = 0;
  let impressions = 0;
  for (const row of rows) {
    clicks += row.clicks;
    impressions += row.impressions;
  }
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
  };
}

/** Bing gives one fixed window with no way to ask for "the period before
 *  that", so the previous-period comparison splits the daily rows Bing
 *  already returned in half: the most recent half vs. the half before it.
 *  With too few days to split meaningfully, there's no previous period. */
export function previousPeriodTotals(rows: BingDailyRow[]): BingTotals | null {
  if (rows.length < 4) return null;
  const half = Math.floor(rows.length / 2);
  return sumBingTotals(rows.slice(0, half));
}

export function currentPeriodTotals(rows: BingDailyRow[]): BingTotals {
  if (rows.length < 4) return sumBingTotals(rows);
  const half = Math.floor(rows.length / 2);
  return sumBingTotals(rows.slice(half));
}

export function toQueryRows(rows: BingQueryStatsRow[]): BingQueryRow[] {
  return rows.map((row) => ({
    query: row.Query,
    clicks: row.Clicks,
    impressions: row.Impressions,
    avgClickPosition: row.AvgClickPosition,
    avgImpressionPosition: row.AvgImpressionPosition,
  }));
}

/** `GetPageStats` returns one row per (query, page) pair; collapse to one row
 *  per page counting the distinct queries that surfaced it. */
export function toPageRows(rows: BingPageStatsRow[]): BingPageRow[] {
  const queriesByPage = new Map<string, Set<string>>();
  for (const row of rows) {
    const queries = queriesByPage.get(row.Page) ?? new Set<string>();
    queries.add(row.Query);
    queriesByPage.set(row.Page, queries);
  }
  return sort(
    Array.from(queriesByPage.entries()).map(([page, queries]) => ({
      page,
      queryCount: queries.size,
    })),
    (a, b) => b.queryCount - a.queryCount,
  );
}

/** Queries already ranking but not yet top-of-page: AvgImpressionPosition in
 *  the 5..20 band, sorted by impressions descending like the GSC page. */
export function buildStrikingDistanceRows(
  rows: BingQueryStatsRow[],
  limit: number = STRIKING_DISTANCE_ROW_LIMIT,
): BingStrikingDistanceRow[] {
  const inBand = rows
    .filter(
      (row) =>
        row.AvgImpressionPosition >= STRIKING_DISTANCE_MIN_POSITION &&
        row.AvgImpressionPosition <= STRIKING_DISTANCE_MAX_POSITION,
    )
    .map((row) => ({
      query: row.Query,
      clicks: row.Clicks,
      impressions: row.Impressions,
      avgImpressionPosition: row.AvgImpressionPosition,
    }));
  return sort(inBand, (a, b) => b.impressions - a.impressions).slice(0, limit);
}
