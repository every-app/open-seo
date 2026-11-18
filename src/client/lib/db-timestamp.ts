/**
 * Parses a timestamp read from either database. Postgres stores ISO-8601 with
 * a trailing Z. SQLite's current_timestamp is UTC as "YYYY-MM-DD HH:MM:SS"
 * with no zone marker, which `new Date` would read as local time.
 */
export function parseDbTimestamp(value: string): Date {
  return new Date(
    /^\d{4}-\d{2}-\d{2} /.test(value) ? `${value.replace(" ", "T")}Z` : value,
  );
}

/**
 * A database timestamp as "YYYY-MM-DD HH:MM" in UTC, which spreadsheets sort
 * and parse as a date. Empty when the value can't be read.
 */
export function formatExportTimestamp(value: string): string {
  const date = parseDbTimestamp(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16).replace("T", " ");
}
