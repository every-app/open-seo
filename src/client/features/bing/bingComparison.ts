type DailyRow = { date: string | null; clicks: number; impressions: number };

type PeriodTotals = {
  clicks: number;
  impressions: number;
  ctr: number;
  startDate: string;
  endDate: string;
};

type BingComparison = {
  current: PeriodTotals;
  previous: PeriodTotals;
};

function totalsOf(rows: Array<DailyRow & { date: string }>): PeriodTotals {
  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0);
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    startDate: rows[0].date.slice(0, 10),
    endDate: rows[rows.length - 1].date.slice(0, 10),
  };
}

/** A previous half carrying less than this share of the current half's
 *  impressions is noise, not a baseline — a ratio against it would print
 *  four-digit percentages that mean nothing. */
const MIN_BASELINE_RATIO = 0.01;

/**
 * Split Bing's daily series into two equal halves for a "vs prior period"
 * delta. Bing decides the reporting window (no date-range parameter exists),
 * so the honest comparison is the latest half of whatever it sent against the
 * preceding equal-length half.
 *
 * Leading all-zero days are trimmed first: Bing pads the window back before a
 * site had any presence, and those rows mean "nothing to report", not "earned
 * zero" — left in, they gut the previous half and inflate every delta.
 *
 * Returns null (no delta shown) for: rows with unparseable dates only, fewer
 * than 4 dated rows after trimming, or a previous half with negligible volume
 * relative to the current half.
 */
export function splitDailySeries(rows: DailyRow[]): BingComparison | null {
  const dated = rows
    .filter((row): row is DailyRow & { date: string } => row.date !== null)
    .toSorted((a, b) => a.date.localeCompare(b.date));
  const firstActive = dated.findIndex(
    (row) => row.clicks > 0 || row.impressions > 0,
  );
  if (firstActive === -1) return null;
  const active = dated.slice(firstActive);
  const half = Math.floor(active.length / 2);
  if (half < 2) return null;
  const current = totalsOf(active.slice(active.length - half));
  const previous = totalsOf(
    active.slice(active.length - 2 * half, active.length - half),
  );
  if (previous.impressions < current.impressions * MIN_BASELINE_RATIO) {
    return null;
  }
  return { current, previous };
}

export type Delta = { text: string; improved: boolean } | null;

export function percentDelta(current: number, previous: number): Delta {
  if (previous <= 0) return null;
  const change = (current - previous) / previous;
  return {
    text: `${change >= 0 ? "+" : ""}${(change * 100).toFixed(1)}%`,
    improved: change >= 0,
  };
}
