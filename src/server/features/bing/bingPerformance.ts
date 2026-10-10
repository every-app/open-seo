import type { BingPerfRow, BingTrafficRow } from "@/server/lib/bingClient";

// Shared option sets — also drive the MCP tool Zod schema so the two stay in sync.
export const BING_GROUP_BY = ["query", "page", "date"] as const;
export type BingGroupBy = (typeof BING_GROUP_BY)[number];

export const BING_SORT_BY = [
  "clicks",
  "impressions",
  "position",
  "date",
] as const;
export type BingSortBy = (typeof BING_SORT_BY)[number];

const BING_DEFAULT_ROW_LIMIT = 100;
// v1 caps rows-per-call to protect the MCP context window. Bing returns every
// query/page/day it has; we aggregate first, then slice.
export const BING_MAX_ROW_LIMIT = 1000;

export type BingPerformanceInput = {
  projectId: string;
  groupBy?: BingGroupBy;
  rowLimit?: number;
  minImpressions?: number;
  minPosition?: number;
  maxPosition?: number;
  sortBy?: BingSortBy;
};

export type BingPerformanceRow = {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  /** Impression-weighted mean of Bing's daily average impression position. */
  position?: number;
};

export type BingCoverage = {
  startDate?: string;
  endDate?: string;
  /** Distinct days Bing returned data for. */
  days: number;
  /** Bing's dates are UTC; GSC reports in America/Los_Angeles. */
  timeZone: "UTC";
};

type Accumulator = {
  clicks: number;
  impressions: number;
  positionWeighted: number;
  positionWeight: number;
};

function keyFor(row: BingPerfRow, groupBy: BingGroupBy): string | undefined {
  return groupBy === "date" ? row.date : row.key;
}

/** Sum clicks/impressions per key and derive CTR; position is an
 *  impression-weighted mean so low-volume days don't distort it. */
function accumulate(
  rows: BingPerfRow[],
  keyOf: (row: BingPerfRow) => string | undefined,
): BingPerformanceRow[] {
  const byKey = new Map<string, Accumulator>();
  for (const row of rows) {
    const key = keyOf(row);
    if (key === undefined) continue;
    const acc = byKey.get(key) ?? {
      clicks: 0,
      impressions: 0,
      positionWeighted: 0,
      positionWeight: 0,
    };
    acc.clicks += row.clicks;
    acc.impressions += row.impressions;
    if (row.position !== undefined && row.impressions > 0) {
      acc.positionWeighted += row.position * row.impressions;
      acc.positionWeight += row.impressions;
    }
    byKey.set(key, acc);
  }
  return [...byKey.entries()].map(([key, acc]) => ({
    key,
    clicks: acc.clicks,
    impressions: acc.impressions,
    ctr: acc.impressions > 0 ? acc.clicks / acc.impressions : 0,
    ...(acc.positionWeight > 0
      ? { position: acc.positionWeighted / acc.positionWeight }
      : {}),
  }));
}

/** Aggregate Bing's per-day rows into one row per query, page, or day. */
export function aggregateBingRows(
  rows: BingPerfRow[],
  groupBy: BingGroupBy = "query",
): BingPerformanceRow[] {
  return accumulate(rows, (row) => keyFor(row, groupBy));
}

/** The date span Bing returned and how many distinct days it covers, so a
 *  caller can align it against another source instead of assuming a window. */
export function bingCoverage(rows: { date?: string }[]): BingCoverage {
  let startDate: string | undefined;
  let endDate: string | undefined;
  const days = new Set<string>();
  for (const row of rows) {
    if (row.date === undefined) continue;
    days.add(row.date);
    if (startDate === undefined || row.date < startDate) startDate = row.date;
    if (endDate === undefined || row.date > endDate) endDate = row.date;
  }
  return {
    ...(startDate === undefined ? {} : { startDate }),
    ...(endDate === undefined ? {} : { endDate }),
    days: days.size,
    timeZone: "UTC",
  };
}

/** Aggregate, apply the server-side metric filters, sort, and cap. Filtering
 *  happens here because Bing cannot filter by position or impressions. */
export function buildBingPerformanceRows(
  rows: BingPerfRow[],
  input: Pick<
    BingPerformanceInput,
    | "groupBy"
    | "rowLimit"
    | "minImpressions"
    | "minPosition"
    | "maxPosition"
    | "sortBy"
  >,
): BingPerformanceRow[] {
  const groupBy = input.groupBy ?? "query";
  const limit = Math.min(
    Math.max(input.rowLimit ?? BING_DEFAULT_ROW_LIMIT, 1),
    BING_MAX_ROW_LIMIT,
  );
  const { minImpressions, minPosition, maxPosition } = input;
  let out = aggregateBingRows(rows, groupBy);
  if (minImpressions !== undefined) {
    out = out.filter((row) => row.impressions >= minImpressions);
  }
  if (minPosition !== undefined) {
    out = out.filter(
      (row) => row.position !== undefined && row.position >= minPosition,
    );
  }
  if (maxPosition !== undefined) {
    out = out.filter(
      (row) => row.position !== undefined && row.position <= maxPosition,
    );
  }
  // A date series reads chronologically by default; otherwise rank by clicks.
  const sortBy = input.sortBy ?? (groupBy === "date" ? "date" : "clicks");
  out.sort((a, b) => {
    if (sortBy === "date") return a.key.localeCompare(b.key);
    if (sortBy === "position") {
      return (
        (a.position ?? Number.POSITIVE_INFINITY) -
        (b.position ?? Number.POSITIVE_INFINITY)
      );
    }
    if (sortBy === "impressions") return b.impressions - a.impressions;
    return b.clicks - a.clicks;
  });
  return out.slice(0, limit);
}

/** The striking-distance band, mirroring Google Search Console's: queries whose
 *  average position sits just off page one. Bing exposes the position, so this
 *  is a plain filter over the query rows — no extra call. */
const BING_STRIKING_MIN_POSITION = 5;
const BING_STRIKING_MAX_POSITION = 20;

export function bingStrikingDistance(
  rows: BingPerfRow[],
): BingPerformanceRow[] {
  return buildBingPerformanceRows(rows, {
    groupBy: "query",
    minPosition: BING_STRIKING_MIN_POSITION,
    maxPosition: BING_STRIKING_MAX_POSITION,
    sortBy: "impressions",
  });
}

/** The whole-site summary. Clicks and impressions come from Bing's
 *  authoritative site-traffic endpoint — the query and page reports each
 *  return only their own top-N subset, so neither sums to the real total.
 *  Position has no site-level equivalent there, so it is the impression-
 *  weighted mean over the query rows. Null when Bing returned no traffic. */
export type BingSiteSummary = {
  clicks: number;
  impressions: number;
  ctr: number;
  position?: number;
};

export function bingSiteSummary(
  traffic: BingTrafficRow[],
  queryRows: BingPerfRow[],
): BingSiteSummary | null {
  if (traffic.length === 0) return null;
  let clicks = 0;
  let impressions = 0;
  for (const row of traffic) {
    clicks += row.clicks;
    impressions += row.impressions;
  }
  // Clicks and impressions come from Bing's site-traffic endpoint, which is
  // the authoritative whole-site total. Its rows carry no position, so the
  // average below is impression-weighted over the query report instead — a
  // top-N subset, so it can differ from a true whole-site average.
  const [positioned] = accumulate(queryRows, () => "total");
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    ...(positioned?.position === undefined
      ? {}
      : { position: positioned.position }),
  };
}
