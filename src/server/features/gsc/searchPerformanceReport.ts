import { sort } from "remeda";
import type { GscSearchAnalyticsRow } from "@/server/lib/gscClient";

/**
 * Pure shaping helpers for the Search Performance page. Kept separate from the
 * server function so the aggregation and striking-distance rules are unit
 * testable without a GSC client.
 */

type SearchPerformanceTotals = {
  clicks: number;
  impressions: number;
  /** 0..1 (clicks / impressions). */
  ctr: number;
  /** Impression-weighted average position; 0 when there were no impressions. */
  position: number;
};

type SearchPerformanceDimensionRow = {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

type StrikingDistanceRow = {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  position: number;
};

// "Striking distance" = already ranking, not yet in the top spots: the queries
// where a content improvement most plausibly moves real traffic.
const STRIKING_DISTANCE_MIN_POSITION = 5;
const STRIKING_DISTANCE_MAX_POSITION = 20;
const STRIKING_DISTANCE_ROW_LIMIT = 100;

const DAY_MS = 24 * 60 * 60 * 1000;

export function sumSearchTotals(
  rows: GscSearchAnalyticsRow[],
): SearchPerformanceTotals {
  let clicks = 0;
  let impressions = 0;
  let weightedPosition = 0;
  for (const row of rows) {
    clicks += row.clicks;
    impressions += row.impressions;
    weightedPosition += row.position * row.impressions;
  }
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: impressions > 0 ? weightedPosition / impressions : 0,
  };
}

/** Flatten single-dimension rows (query or page) into a keyed table row. */
export function toDimensionRows(
  rows: GscSearchAnalyticsRow[],
): SearchPerformanceDimensionRow[] {
  const output: SearchPerformanceDimensionRow[] = [];
  for (const row of rows) {
    const key = row.keys?.[0];
    if (!key) continue;
    output.push({
      key,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    });
  }
  return output;
}

/** Collapse `["query","page"]` rows to each query's best-ranking page.
 *
 *  GSC returns a row per page that ranks for a query, so a query fans out across
 *  every page it appears on. The site ranks for a query where its best page
 *  does (lowest average position; ties broken by impressions). */
export function bestPagePerQuery(
  rows: GscSearchAnalyticsRow[],
): StrikingDistanceRow[] {
  const topPageByQuery = new Map<string, StrikingDistanceRow>();
  for (const row of rows) {
    const query = row.keys?.[0];
    const page = row.keys?.[1];
    if (!query || !page) continue;

    const current = topPageByQuery.get(query);
    const isBetter =
      !current ||
      row.position < current.position ||
      (row.position === current.position &&
        row.impressions > current.impressions);
    if (!isBetter) continue;

    topPageByQuery.set(query, {
      query,
      page,
      clicks: row.clicks,
      impressions: row.impressions,
      position: row.position,
    });
  }
  return Array.from(topPageByQuery.values());
}

/** Reduce `["query","page"]` rows to one striking-distance row per query.
 *
 *  A query only belongs in "striking distance" when the site's BEST-ranking
 *  page for it sits in the 5..20 band — if any page already ranks above
 *  position 5, the site effectively ranks near the top and improving a
 *  secondary page won't move traffic. Result is sorted by impressions. */
export function buildStrikingDistanceRows(
  rows: GscSearchAnalyticsRow[],
  limit: number = STRIKING_DISTANCE_ROW_LIMIT,
): StrikingDistanceRow[] {
  return sort(
    bestPagePerQuery(rows).filter(
      (row) =>
        row.position >= STRIKING_DISTANCE_MIN_POSITION &&
        row.position <= STRIKING_DISTANCE_MAX_POSITION,
    ),
    (a, b) => b.impressions - a.impressions,
  ).slice(0, limit);
}

type SearchPerformanceTrendDay = {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  /** Null on a day with no impressions, so a chart skips it, not rank 0. */
  position: number | null;
};

/** One point per day across the range, oldest first, from `["date"]` rows.
 *  GSC omits days with no impressions, which would silently shrink a chart's
 *  x-axis. Dates are YYYY-MM-DD in UTC. */
export function buildDailyTrend(
  rows: GscSearchAnalyticsRow[],
  startDate: string,
  endDate: string,
): SearchPerformanceTrendDay[] {
  const rowsByDate = new Map(rows.map((row) => [row.keys?.[0], row]));
  const days: SearchPerformanceTrendDay[] = [];
  const end = Date.parse(`${endDate}T00:00:00Z`);
  for (
    let day = Date.parse(`${startDate}T00:00:00Z`);
    day <= end;
    day += DAY_MS
  ) {
    const date = formatUtcDate(day);
    const row = rowsByDate.get(date);
    days.push({
      date,
      clicks: row?.clicks ?? 0,
      impressions: row?.impressions ?? 0,
      ctr: row?.ctr ?? 0,
      position: row && row.impressions > 0 ? row.position : null,
    });
  }
  return days;
}

type ClickChangeRow = {
  key: string;
  clicks: number;
  prevClicks: number;
  /** Null in a period where the key did not appear. */
  position: number | null;
  prevPosition: number | null;
};

const CLICK_CHANGE_ROW_LIMIT = 5;

function clickChange(row: ClickChangeRow): number {
  return row.clicks - row.prevClicks;
}

/** One period's single-dimension rows by key, for comparing two periods.
 *
 *  GSC returns the rows with the most clicks first, so a key missing from a
 *  full page (`limit` rows) had at most as many clicks as the page's weakest
 *  row. When that is zero, or the page is not full, a missing key had exactly
 *  zero clicks. Otherwise its clicks are unknown. */
function indexPeriodRows(rows: GscSearchAnalyticsRow[], limit: number) {
  const byKey = new Map<string, GscSearchAnalyticsRow>();
  for (const row of rows) {
    const key = row.keys?.[0];
    if (key) byKey.set(key, row);
  }
  const missingIsZero =
    rows.length < limit || rows.some((row) => row.clicks === 0);
  return { byKey, missingIsZero };
}

/** Previous-period clicks for the keys of a table page. Null when unknown. */
export function previousClicksLookup(
  previousRows: GscSearchAnalyticsRow[],
  limit: number,
): (key: string) => number | null {
  const previous = indexPeriodRows(previousRows, limit);
  return (key) =>
    previous.byKey.get(key)?.clicks ?? (previous.missingIsZero ? 0 : null);
}

/** The keys that gained and lost the most clicks between two periods, from
 *  each period's top `limit` rows. A key whose clicks are unknown in either
 *  period is left out rather than guessed. */
export function buildClickChanges(
  currentRows: GscSearchAnalyticsRow[],
  previousRows: GscSearchAnalyticsRow[],
  limit: number,
): { gained: ClickChangeRow[]; lost: ClickChangeRow[] } {
  const current = indexPeriodRows(currentRows, limit);
  const previous = indexPeriodRows(previousRows, limit);
  const changes: ClickChangeRow[] = [];
  for (const [key, row] of current.byKey) {
    const before = previous.byKey.get(key);
    if (!before && !previous.missingIsZero) continue;
    changes.push({
      key,
      clicks: row.clicks,
      prevClicks: before?.clicks ?? 0,
      position: row.position,
      prevPosition: before?.position ?? null,
    });
  }
  for (const [key, before] of previous.byKey) {
    if (current.byKey.has(key) || !current.missingIsZero) continue;
    changes.push({
      key,
      clicks: 0,
      prevClicks: before.clicks,
      position: null,
      prevPosition: before.position,
    });
  }
  return {
    gained: sort(
      changes.filter((row) => clickChange(row) > 0),
      (a, b) => clickChange(b) - clickChange(a),
    ).slice(0, CLICK_CHANGE_ROW_LIMIT),
    lost: sort(
      changes.filter((row) => clickChange(row) < 0),
      (a, b) => clickChange(a) - clickChange(b),
    ).slice(0, CLICK_CHANGE_ROW_LIMIT),
  };
}

/** The same-length period immediately before [startDate, endDate], for the
 *  totals comparison. Dates are YYYY-MM-DD in UTC. */
export function previousPeriod(
  startDate: string,
  endDate: string,
): { startDate: string; endDate: string } {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  const lengthMs = Math.max(end - start, 0);
  const prevEnd = start - DAY_MS;
  const prevStart = prevEnd - lengthMs;
  return {
    startDate: formatUtcDate(prevStart),
    endDate: formatUtcDate(prevEnd),
  };
}

function formatUtcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
