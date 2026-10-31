// Period resolution for the web analytics dashboard.
//
// Buckets are UTC: `substr(ts, 1, n)` slices of the ISO timestamps are exact
// and dialect-neutral, which keeps one query shape for D1 and Postgres. The
// range ends at `now` (not the end of today) so "today" never shows empty
// future hours.

import type { WebAnalyticsPeriod } from "@/types/schemas/web-analytics";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export type Granularity = "hour" | "day";

export interface AnalyticsRange {
  /** ISO timestamp, inclusive lower bound on session started_at. */
  from: string;
  /** ISO timestamp, exclusive upper bound on session started_at. */
  to: string;
  granularity: Granularity;
}

function startOfUtcDay(ms: number): number {
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

export function resolveRange(
  period: WebAnalyticsPeriod,
  now = Date.now(),
): AnalyticsRange {
  switch (period) {
    case "today":
      return {
        from: new Date(startOfUtcDay(now)).toISOString(),
        to: new Date(now).toISOString(),
        granularity: "hour",
      };
    case "7d":
      return {
        from: new Date(startOfUtcDay(now - 6 * DAY_MS)).toISOString(),
        to: new Date(now).toISOString(),
        granularity: "day",
      };
    case "90d":
      return {
        from: new Date(startOfUtcDay(now - 89 * DAY_MS)).toISOString(),
        to: new Date(now).toISOString(),
        granularity: "day",
      };
    case "30d":
    default:
      return {
        from: new Date(startOfUtcDay(now - 29 * DAY_MS)).toISOString(),
        to: new Date(now).toISOString(),
        granularity: "day",
      };
  }
}

/** Previous period of the same length, for the period-over-period deltas. */
export function previousRange(range: AnalyticsRange): AnalyticsRange {
  const fromMs = Date.parse(range.from);
  const toMs = Date.parse(range.to);
  return {
    from: new Date(fromMs - (toMs - fromMs)).toISOString(),
    to: range.from,
    granularity: range.granularity,
  };
}

/** substr() length that groups ISO timestamps into one label per bucket. */
export function bucketLength(granularity: Granularity): 10 | 13 {
  return granularity === "hour" ? 13 : 10;
}

/** Every bucket key in the range (ISO prefix of `bucketLength` chars), so the
 * chart has no gaps. Mirrors the SQL grouping exactly. */
export function bucketKeys(range: AnalyticsRange): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const step = range.granularity === "hour" ? HOUR_MS : DAY_MS;
  const length = bucketLength(range.granularity);
  for (let t = Date.parse(range.from); t < Date.parse(range.to); t += step) {
    const key = new Date(t).toISOString().slice(0, length);
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}
