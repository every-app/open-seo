export type RankSnapshotPoint = {
  trackingKeywordId: string;
  keyword: string;
  device: "desktop" | "mobile";
  position: number | null;
};

export type RankPositionChange = {
  trackingKeywordId: string;
  keyword: string;
  device: "desktop" | "mobile";
  previousPosition: number | null;
  position: number | null;
  delta: number;
};

/** Maps "not in SERP" to one step beyond depth so movement off-page counts. */
export function rankDistance(
  position: number | null,
  serpDepth: number,
): number {
  return position ?? serpDepth + 1;
}

export function computeRankPositionChanges(input: {
  current: RankSnapshotPoint[];
  previous: RankSnapshotPoint[];
  serpDepth: number;
  positionThreshold: number;
}): RankPositionChange[] {
  const previousByKey = new Map<string, RankSnapshotPoint>();
  for (const snap of input.previous) {
    previousByKey.set(`${snap.trackingKeywordId}:${snap.device}`, snap);
  }

  const changes: RankPositionChange[] = [];
  for (const snap of input.current) {
    const key = `${snap.trackingKeywordId}:${snap.device}`;
    const prev = previousByKey.get(key);
    if (!prev) continue;

    const delta = Math.abs(
      rankDistance(snap.position, input.serpDepth) -
        rankDistance(prev.position, input.serpDepth),
    );
    if (delta < input.positionThreshold) continue;

    changes.push({
      trackingKeywordId: snap.trackingKeywordId,
      keyword: snap.keyword,
      device: snap.device,
      previousPosition: prev.position,
      position: snap.position,
      delta,
    });
  }

  return changes.sort((a, b) => b.delta - a.delta);
}

export function filterRankChangesByDirection(input: {
  changes: RankPositionChange[];
  serpDepth: number;
  direction: "either" | "improved" | "worsened";
}): RankPositionChange[] {
  if (input.direction === "either") return input.changes;
  const want = input.direction;
  return input.changes.filter(
    (change) => rankMovementDirection(change, input.serpDepth) === want,
  );
}

export function formatRankPosition(position: number | null): string {
  return position == null ? "Not in results" : `#${position}`;
}

export function formatRankChangeLine(change: RankPositionChange): string {
  return `${change.keyword} (${change.device}): ${formatRankPosition(change.previousPosition)} → ${formatRankPosition(change.position)} (Δ${change.delta})`;
}

/** Lower rank distance = better Google position (matches rank-tracking matrix). */
export function rankMovementDirection(
  change: RankPositionChange,
  serpDepth: number,
): "improved" | "worsened" {
  const previousDistance = rankDistance(change.previousPosition, serpDepth);
  const currentDistance = rankDistance(change.position, serpDepth);
  return currentDistance < previousDistance ? "improved" : "worsened";
}

export function formatRankTrendLabel(
  change: RankPositionChange,
  serpDepth: number,
): { arrow: string; direction: "improved" | "worsened"; text: string } {
  const direction = rankMovementDirection(change, serpDepth);
  const arrow = direction === "improved" ? "▲" : "▼";
  return {
    arrow,
    direction,
    text: `${arrow} ${change.delta}`,
  };
}
