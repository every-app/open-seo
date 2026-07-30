type DeviceObservation = {
  position: number | null;
  previousPosition: number | null;
};

type RankSummaryRow = {
  desktop: DeviceObservation;
  mobile: DeviceObservation;
};

type RankRowCounts = {
  trackedKeywords: number;
  improved: number;
  declined: number;
  top10: number;
};

function bestPosition(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

export function summarizeRankRows(rows: RankSummaryRow[]): RankRowCounts {
  const counts: RankRowCounts = {
    trackedKeywords: rows.length,
    improved: 0,
    declined: 0,
    top10: 0,
  };

  for (const row of rows) {
    const position = bestPosition(row.desktop.position, row.mobile.position);
    const previousPosition = bestPosition(
      row.desktop.previousPosition,
      row.mobile.previousPosition,
    );

    if (position !== null && position <= 10) counts.top10 += 1;
    if (position === null || previousPosition === null) continue;
    if (position < previousPosition) counts.improved += 1;
    else if (position > previousPosition) counts.declined += 1;
  }

  return counts;
}
