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
export function rankDistance(position: number | null, serpDepth: number): number {
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

export function formatRankPosition(position: number | null): string {
  return position == null ? "Not in results" : `#${position}`;
}

export function formatRankChangeLine(change: RankPositionChange): string {
  return `${change.keyword} (${change.device}): ${formatRankPosition(change.previousPosition)} → ${formatRankPosition(change.position)} (Δ${change.delta})`;
}
