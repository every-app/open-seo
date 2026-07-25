/**
 * Bing's rows are day BUCKETS, not instants: the WCF value is midnight in
 * Bing's own reporting timezone (US Pacific — the offset shifts with daylight
 * saving), which bingClient converts to an ISO instant like
 * `2026-02-09T08:00:00.000Z`. Formatting that in the viewer's timezone shifts
 * the label back a day for anyone at UTC-9 or further west, so the day is read
 * in UTC instead. A null means Bing sent something unparseable — show that
 * rather than invent a date.
 */
export function formatBingDay(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
