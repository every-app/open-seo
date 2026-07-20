// SQLite's current_timestamp default ("YYYY-MM-DD HH:mm:ss") has no timezone
// marker, so browsers parse it as local time even though stored values are
// UTC. Postgres returns ISO UTC strings that parse correctly as-is.
const SQLITE_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2} /;

export function parseTimestampMs(timestamp: string): number {
  return Date.parse(
    SQLITE_TIMESTAMP_RE.test(timestamp)
      ? `${timestamp.replace(" ", "T")}Z`
      : timestamp,
  );
}

export function formatTimestampIso(timestamp: string): string {
  const ms = parseTimestampMs(timestamp);
  return Number.isNaN(ms) ? timestamp : new Date(ms).toISOString();
}

export function formatTimestampDate(
  timestamp: string,
  locales?: Intl.LocalesArgument,
  options?: Intl.DateTimeFormatOptions,
): string {
  const ms = parseTimestampMs(timestamp);
  if (Number.isNaN(ms)) return timestamp;
  // Default to UTC so date labels never shift with the browser timezone
  // (#94); callers can still override via options.timeZone.
  return new Date(ms).toLocaleDateString(locales, {
    timeZone: "UTC",
    ...options,
  });
}
