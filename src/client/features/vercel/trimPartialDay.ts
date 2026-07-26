type DailyRow = { key: string; visitors: number; pageviews: number };

/**
 * Drop today's (and any later) bucket from the daily chart series. The
 * report window deliberately runs "until tomorrow" so the TILES include
 * today's traffic, but on a chart the always-partial current day renders as
 * a cliff to zero at the right edge. Buckets are UTC days keyed by ISO
 * timestamp; rows with unparseable keys are dropped too.
 */
export function trimTrailingPartialDay(
  rows: DailyRow[],
  now: Date,
): DailyRow[] {
  const startOfTodayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return rows.filter((row) => {
    const time = Date.parse(row.key);
    return Number.isFinite(time) && time < startOfTodayUtc;
  });
}
