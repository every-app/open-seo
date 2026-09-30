import { getDatabaseProvider } from "@/db/provider";

/** SQLite `current_timestamp` shape: `YYYY-MM-DD HH:MM:SS` (UTC, no millis). */
export function toSqliteTimestamp(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Lexicographic cutoff for rank-snapshot `checkedAt` comparisons.
 *
 * Postgres stores ISO text (`YYYY-MM-DDTHH:MM:SS.MSZ` via `isoNow`); SQLite
 * stores space-separated `current_timestamp`. Mixing formats makes same-day
 * cutoffs sort incorrectly (` ` < `T`), so history/compare windows miss or
 * include the wrong rows on hosted Postgres.
 */
export function toRankTrackingCutoffTimestamp(date: Date): string {
  if (getDatabaseProvider() === "postgres") {
    return date.toISOString();
  }
  return toSqliteTimestamp(date);
}
