import type { PagespeedSnapshotLike } from "@/shared/pagespeed";

type TrendPoint = {
  t: number;
  performance: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
  lcpMs: number | null;
  cls: number | null;
  tbtMs: number | null;
  fieldLcpMs: number | null;
  fieldInpMs: number | null;
  fieldCls: number | null;
};

/**
 * Snapshot timestamps arrive in two shapes: SQLite's `current_timestamp`
 * gives "2026-07-29 10:00:00" (UTC, no zone marker), Postgres gives a full
 * ISO string. Parsing the SQLite form without pinning it to UTC would shift
 * every point by the viewer's offset.
 */
export function parseSnapshotTime(createdAt: string): number {
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(createdAt);
  const normalized = createdAt.replace(" ", "T");
  return new Date(hasZone ? normalized : `${normalized}Z`).getTime();
}

/**
 * Chronological chart rows for one URL and strategy. Failed runs are dropped:
 * they have no values to plot, and a gap in the line is more honest than a
 * point at zero. A run whose timestamp cannot be parsed is dropped too rather
 * than plotted at the epoch.
 */
export function buildTrendSeries(
  snapshots: readonly PagespeedSnapshotLike[],
  strategy: string,
): TrendPoint[] {
  return snapshots
    .filter(
      (snapshot) =>
        snapshot.strategy === strategy && snapshot.errorMessage === null,
    )
    .map((snapshot) => ({
      t: parseSnapshotTime(snapshot.createdAt),
      performance: snapshot.performanceScore,
      accessibility: snapshot.accessibilityScore,
      bestPractices: snapshot.bestPracticesScore,
      seo: snapshot.seoScore,
      lcpMs: snapshot.lcpMs,
      cls: snapshot.cls,
      tbtMs: snapshot.tbtMs,
      fieldLcpMs: snapshot.fieldLcpMs,
      fieldInpMs: snapshot.fieldInpMs,
      fieldCls: snapshot.fieldCls,
    }))
    .filter((point) => Number.isFinite(point.t))
    .toSorted((a, b) => a.t - b.t);
}
