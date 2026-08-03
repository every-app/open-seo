type DailyRow = { date: string | null; clicks: number; impressions: number };

type PeriodTotals = {
  clicks: number;
  impressions: number;
  ctr: number;
  startDate: string;
  endDate: string;
};

export type BingTrafficReport = {
  current: PeriodTotals;
  /** Null when Bing's reporting window doesn't reach back far enough to
   *  cover the full prior 28 days — no delta is shown rather than comparing
   *  against a partial window. */
  previous: PeriodTotals | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 28;

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
 * Fixed-window totals over Bing's daily series: the latest 28 reported days,
 * plus the prior 28 for a delta — mirroring the Search Console report's
 * last-28-days framing. Bing's endpoint takes no date range (it returns
 * whatever window it decides), so the windows are cut client-side from the
 * rows it sent, anchored on the newest reported day.
 *
 * Rows are day buckets stamped at midnight US Pacific, so a row's window is
 * chosen by its rounded day-distance from the newest row — rounding absorbs
 * the ±1h jitter a DST boundary adds to otherwise 24h-spaced buckets.
 *
 * Returns null when no row has a parseable date.
 */
export function last28DayReport(rows: DailyRow[]): BingTrafficReport | null {
  const dated = rows
    .flatMap((row) =>
      row.date === null ? [] : [{ ...row, date: row.date, ms: Date.parse(row.date) }],
    )
    .filter((row) => Number.isFinite(row.ms))
    .toSorted((a, b) => a.ms - b.ms);
  if (dated.length === 0) return null;

  const endMs = dated[dated.length - 1].ms;
  const dayIndex = (ms: number) => Math.round((endMs - ms) / DAY_MS);
  const currentRows = dated.filter((row) => dayIndex(row.ms) < WINDOW_DAYS);
  const previousRows = dated.filter((row) => {
    const index = dayIndex(row.ms);
    return index >= WINDOW_DAYS && index < 2 * WINDOW_DAYS;
  });
  const spanCoversPrevious = dayIndex(dated[0].ms) >= 2 * WINDOW_DAYS - 1;

  return {
    current: totalsOf(currentRows),
    previous:
      spanCoversPrevious && previousRows.length > 0
        ? totalsOf(previousRows)
        : null,
  };
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
