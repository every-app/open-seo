export const PAGESPEED_STRATEGY_VALUES = ["mobile", "desktop"] as const;
export type PagespeedStrategyValue = (typeof PAGESPEED_STRATEGY_VALUES)[number];

export type PagespeedTrigger = "manual" | "scheduled";

/** The sweep runs each monitored URL once a day. Deliberately not
 *  configurable: PSI has a daily quota, and finer granularity buys nothing
 *  when CrUX field data only moves on a 28-day rolling window. */
const PAGESPEED_SCHEDULE_INTERVAL_HOURS = 24;

/**
 * When a URL should next be swept.
 *
 * Anchored to the previous due time rather than to now, so a sweep that fires
 * late keeps its daily slot instead of walking later every day. The anchor is
 * advanced in whole intervals until it lands in the future, which preserves
 * the slot without emitting a past timestamp that would make the URL due again
 * on the very next tick — so a deploy gap or a paused instance costs missed
 * runs, never a backlog of catch-up runs.
 */
export function computeNextPagespeedRunAt(
  now: Date,
  previousNextRunAt: string | null,
): string {
  const stepMs = PAGESPEED_SCHEDULE_INTERVAL_HOURS * 60 * 60 * 1000;
  const anchor = previousNextRunAt ? Date.parse(previousNextRunAt) : Number.NaN;
  if (!Number.isFinite(anchor)) {
    return new Date(now.getTime() + stepMs).toISOString();
  }
  // At least one step, so a future anchor still moves forward.
  const steps = Math.max(1, Math.floor((now.getTime() - anchor) / stepMs) + 1);
  return new Date(anchor + steps * stepMs).toISOString();
}

/** The snapshot fields shared code reads. Structural rather than the Drizzle
 *  row type so this module stays importable from the client. */
export type PagespeedSnapshotLike = {
  id: string;
  urlId: string;
  strategy: string;
  performanceScore: number | null;
  accessibilityScore: number | null;
  bestPracticesScore: number | null;
  seoScore: number | null;
  lcpMs: number | null;
  cls: number | null;
  tbtMs: number | null;
  fcpMs: number | null;
  speedIndexMs: number | null;
  ttfbMs: number | null;
  fieldLcpMs: number | null;
  fieldInpMs: number | null;
  fieldCls: number | null;
  fieldOverallCategory: string | null;
  fieldSource: string | null;
  fetchTime: string | null;
  errorMessage: string | null;
  createdAt: string;
  /** Optional so client fixtures and older rows need not supply it. */
  trigger?: string | null;
};

/** Lighthouse's own score banding: 90+ good, 50-89 needs work, below poor. */
export type ScoreTone = "good" | "average" | "poor" | "none";

export function scoreTone(score: number | null | undefined): ScoreTone {
  if (typeof score !== "number") return "none";
  if (score >= 90) return "good";
  if (score >= 50) return "average";
  return "poor";
}

/** Core Web Vitals "good" thresholds, applied to field data. Google scores
 *  ranking on the field numbers, not the lab ones. */
export const CWV_THRESHOLDS = {
  lcpMs: { good: 2500, poor: 4000 },
  inpMs: { good: 200, poor: 500 },
  cls: { good: 0.1, poor: 0.25 },
} as const;

export function metricTone(
  value: number | null | undefined,
  thresholds: { good: number; poor: number },
): ScoreTone {
  if (typeof value !== "number") return "none";
  if (value <= thresholds.good) return "good";
  if (value <= thresholds.poor) return "average";
  return "poor";
}

/** Milliseconds as seconds for anything over a second, else whole ms. */
export function formatMs(value: number | null | undefined): string {
  if (typeof value !== "number") return "—";
  if (value >= 1000) return `${(value / 1000).toFixed(1)} s`;
  return `${Math.round(value)} ms`;
}

export function formatCls(value: number | null | undefined): string {
  return typeof value === "number" ? value.toFixed(3) : "—";
}

export function formatScore(value: number | null | undefined): string {
  return typeof value === "number" ? String(value) : "—";
}

/**
 * A snapshot paired with the run before it, for the same URL and strategy.
 * Generic so server callers keep the full database row (they need `r2Key`)
 * while the client keeps the structural type.
 */
export type SnapshotWithPrevious<
  T extends PagespeedSnapshotLike = PagespeedSnapshotLike,
> = {
  snapshot: T;
  previous: T | null;
};

/**
 * Every snapshot per URL for one strategy, newest first, each paired with the
 * next older run that actually scored.
 *
 * Error rows are kept: a failed run is the latest thing that happened to that
 * URL, and hiding it would present stale numbers as current. They are skipped
 * when choosing the comparison run, though — a delta against a failed run
 * would be meaningless.
 */
export function historyByUrl<T extends PagespeedSnapshotLike>(
  snapshots: readonly T[],
  strategy: string,
): Map<string, SnapshotWithPrevious<T>[]> {
  const byUrl = new Map<string, T[]>();
  for (const snapshot of snapshots) {
    if (snapshot.strategy !== strategy) continue;
    const bucket = byUrl.get(snapshot.urlId);
    if (bucket) bucket.push(snapshot);
    else byUrl.set(snapshot.urlId, [snapshot]);
  }

  const out = new Map<string, SnapshotWithPrevious<T>[]>();
  for (const [urlId, bucket] of byUrl) {
    const ordered = bucket.toSorted((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    out.set(
      urlId,
      ordered.map((snapshot, index) => ({
        snapshot,
        previous:
          ordered.slice(index + 1).find((row) => row.errorMessage === null) ??
          null,
      })),
    );
  }
  return out;
}

/** The most recent snapshot per URL for one strategy, with its comparison run. */
export function latestByUrl<T extends PagespeedSnapshotLike>(
  snapshots: readonly T[],
  strategy: string,
): Map<string, SnapshotWithPrevious<T>> {
  const out = new Map<string, SnapshotWithPrevious<T>>();
  for (const [urlId, entries] of historyByUrl(snapshots, strategy)) {
    const first = entries[0];
    if (first) out.set(urlId, first);
  }
  return out;
}

/** Signed delta between two scores, or null when either is missing. */
export function scoreDelta(
  current: number | null | undefined,
  previous: number | null | undefined,
): number | null {
  if (typeof current !== "number" || typeof previous !== "number") return null;
  return current - previous;
}

/** "92 (+3)" — a score with its change since the previous run. */
export function formatScoreWithDelta(
  current: number | null | undefined,
  previous: number | null | undefined,
): string {
  const base = formatScore(current);
  const delta = scoreDelta(current, previous);
  if (delta === null || delta === 0) return base;
  return `${base} (${delta > 0 ? "+" : ""}${delta})`;
}
