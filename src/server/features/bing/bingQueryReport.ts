import type { BingStatRow } from "@/server/lib/bingClient";

/** Bing's striking-distance band: close enough to page one to be worth
 *  optimizing, mirroring the GSC panel's 5–20 position range. */
const BING_STRIKING_MIN_POSITION = 5;
const BING_STRIKING_MAX_POSITION = 20;

/** One query (or page) aggregated across Bing's whole sampled window.
 *  `position` is the impression-weighted average of AvgImpressionPosition,
 *  or null when no sampled row carried a positive position. */
export type BingAggregateRow = {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number | null;
};

/** Collapse Bing's sampled per-date rows into one row per key. Rows are
 *  sampled at ~16 dates over ~5 months, so the only honest number is a
 *  whole-window total; per-row dates are deliberately dropped. Rows with
 *  AvgImpressionPosition <= 0 still contribute clicks/impressions but are
 *  excluded from the position weighting. Sorted by clicks desc, then
 *  impressions desc. */
export function aggregateBingStatRows(rows: BingStatRow[]): BingAggregateRow[] {
  const byKey = new Map<
    string,
    {
      clicks: number;
      impressions: number;
      positionWeight: number;
      weightedPosition: number;
    }
  >();
  for (const row of rows) {
    const entry = byKey.get(row.key) ?? {
      clicks: 0,
      impressions: 0,
      positionWeight: 0,
      weightedPosition: 0,
    };
    entry.clicks += row.clicks;
    entry.impressions += row.impressions;
    if (row.avgImpressionPosition > 0 && row.impressions > 0) {
      entry.positionWeight += row.impressions;
      entry.weightedPosition += row.avgImpressionPosition * row.impressions;
    }
    byKey.set(row.key, entry);
  }
  return [...byKey.entries()]
    .map(([key, entry]) => ({
      key,
      clicks: entry.clicks,
      impressions: entry.impressions,
      ctr: entry.impressions > 0 ? entry.clicks / entry.impressions : 0,
      position:
        entry.positionWeight > 0
          ? entry.weightedPosition / entry.positionWeight
          : null,
    }))
    .toSorted((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
}

/** Aggregated query rows sitting at positions 5–20, sorted by impressions
 *  desc — the queries closest to meaningful ranking gains. */
export function buildBingStrikingRows(
  aggregated: BingAggregateRow[],
): BingAggregateRow[] {
  return aggregated
    .filter(
      (row) =>
        row.position !== null &&
        row.position >= BING_STRIKING_MIN_POSITION &&
        row.position <= BING_STRIKING_MAX_POSITION,
    )
    .toSorted((a, b) => b.impressions - a.impressions);
}
