import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import type { RankPositionMatrixCell } from "@/serverFunctions/rank-tracking";

/**
 * "By date" view: keyword rows × recent check columns, each cell the position
 * on that date with its change vs the previous check. This is the pivoted
 * history table users want for client reporting ("look — we won 5 positions").
 */
export function RankTrackingHistoryMatrix({
  cells,
  isLoading,
  keywords,
}: {
  cells: RankPositionMatrixCell[];
  isLoading: boolean;
  keywords: { trackingKeywordId: string; keyword: string }[];
}) {
  const { runs, cellByKeyword } = useMemo(() => buildMatrix(cells), [cells]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="size-5 animate-spin text-base-content/50" />
      </div>
    );
  }

  if (runs.length === 0 || keywords.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-base-300 p-10 text-center text-sm text-base-content/55">
        No history yet. Run a check to start building the timeline.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-base-300">
      <table className="table table-sm">
        <thead>
          <tr>
            {/* Unconstrained keyword column absorbs the slack when only a few
                check columns exist, so sparse history doesn't stretch oddly. */}
            <th className="sticky left-0 z-10 bg-base-100 w-full">Keyword</th>
            {runs.map((r) => (
              <th
                key={r.runId}
                className="w-24 whitespace-nowrap text-right text-xs font-medium text-base-content/60"
              >
                {formatDate(r.checkedAt)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {keywords.map((kw) => {
            const byRun = cellByKeyword.get(kw.trackingKeywordId);
            return (
              <tr key={kw.trackingKeywordId}>
                <td className="sticky left-0 z-10 bg-base-100 whitespace-nowrap font-medium">
                  {kw.keyword}
                </td>
                {runs.map((r, i) => {
                  const position = byRun?.get(r.runId) ?? null;
                  const previous =
                    i > 0 ? (byRun?.get(runs[i - 1].runId) ?? null) : undefined;
                  return (
                    <td key={r.runId} className="text-right">
                      <MatrixCell position={position} previous={previous} />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MatrixCell({
  position,
  previous,
}: {
  position: number | null;
  previous: number | null | undefined;
}) {
  if (position === null) {
    return <span className="text-base-content/30">—</span>;
  }
  // Only show a change arrow when both checks ranked (no subtracting through a
  // null, matching the rest of the rank-tracking UI).
  const change =
    previous != null && previous !== undefined ? previous - position : null;
  return (
    <span className="inline-flex items-center justify-end gap-1 font-mono text-xs">
      <span>{position}</span>
      {change != null && change > 0 && (
        <span className="text-success">▲{change}</span>
      )}
      {change != null && change < 0 && (
        <span className="text-warning">▼{-change}</span>
      )}
    </span>
  );
}

interface MatrixRun {
  runId: string;
  checkedAt: string;
}

/** Distinct completed runs in a matrix payload (= history columns). */
export function countMatrixRuns(cells: RankPositionMatrixCell[]): number {
  return new Set(cells.map((c) => c.runId)).size;
}

function buildMatrix(cells: RankPositionMatrixCell[]): {
  runs: MatrixRun[];
  cellByKeyword: Map<string, Map<string, number | null>>;
} {
  const runMap = new Map<string, string>(); // runId -> checkedAt
  const cellByKeyword = new Map<string, Map<string, number | null>>();
  for (const c of cells) {
    runMap.set(c.runId, c.checkedAt);
    let byRun = cellByKeyword.get(c.trackingKeywordId);
    if (!byRun) {
      byRun = new Map();
      cellByKeyword.set(c.trackingKeywordId, byRun);
    }
    byRun.set(c.runId, c.position);
  }
  const runs = [...runMap.entries()]
    .map(([runId, checkedAt]) => ({ runId, checkedAt }))
    .toSorted((a, b) => a.checkedAt.localeCompare(b.checkedAt));
  return { runs, cellByKeyword };
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
