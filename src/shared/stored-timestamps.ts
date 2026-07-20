const SQLITE_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/;

/** Parse timestamp text stored by either the SQLite or Postgres backend. */
export function parseStoredTimestamp(value: string): Date | null {
  const normalized = SQLITE_UTC_TIMESTAMP.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  const timestamp = Date.parse(normalized);
  return Number.isNaN(timestamp) ? null : new Date(timestamp);
}
