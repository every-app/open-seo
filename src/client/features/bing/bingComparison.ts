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

/**
 * Split Bing's daily series into two equal halves for a "vs prior period"
 * delta. Bing decides the reporting window (no date-range parameter exists),
 * so the honest comparison is the latest half of whatever it sent against the
 * preceding equal-length half. Rows with unparseable (null) dates are dropped;
 * fewer than 4 dated rows yields null (no meaningful comparison).
 */
export function splitDailySeries(rows: DailyRow[]): BingComparison | null {
  const dated = rows
    .filter((row): row is DailyRow & { date: string } => row.date !== null)
    .toSorted((a, b) => a.date.localeCompare(b.date));
  const half = Math.floor(dated.length / 2);
  if (half < 2) return null;
  const current = dated.slice(dated.length - half);
  const previous = dated.slice(dated.length - 2 * half, dated.length - half);
  return { current: totalsOf(current), previous: totalsOf(previous) };
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
