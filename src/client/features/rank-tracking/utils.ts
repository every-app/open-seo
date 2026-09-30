/**
 * Parse a database timestamp string into a UTC-respecting form.
 *
 * SQLite's current_timestamp produces "YYYY-MM-DD HH:mm:ss" with no timezone
 * marker, so browsers interpret it as local time. This function detects that
 * shape and appends the Z marker for UTC interpretation. ISO-8601 timestamps
 * (from Postgres / JavaScript) pass through unchanged.
 */
export function parseTimestamp(ts: string): string {
  if (/^\d{4}-\d{2}-\d{2} /.test(ts)) {
    return `${ts.replace(" ", "T")}Z`;
  }
  return ts;
}
