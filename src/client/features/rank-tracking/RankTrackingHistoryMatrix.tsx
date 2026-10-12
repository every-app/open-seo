import { useMemo } from "react";
import { sort } from "remeda";
import type { RankPositionMatrixCell } from "@/serverFunctions/rank-tracking";
import { EmptyState } from "@/client/components/EmptyState";
import { Button } from "@/client/components/ui/button";
import {
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";

/**
 * "By date" view: keyword rows × recent check columns, each cell the position
 * on that date with its change vs the previous check. This is the pivoted
 * history table users want for client reporting ("look — we won 5 positions").
 */
export function RankTrackingHistoryMatrix({
  cells,
  keywords,
  onClearFilters,
}: {
  cells: RankPositionMatrixCell[];
  keywords: { trackingKeywordId: string; keyword: string }[];
  onClearFilters: () => void;
}) {
  const { runs, cellByKeyword } = useMemo(() => buildMatrix(cells), [cells]);

  // The History view is only offered once the matrix has loaded at least two
  // runs, so only filters can leave this empty.
  if (keywords.length === 0) {
    return (
      <EmptyState
        kind="filtered"
        title="No keywords match these filters"
        description="Change or clear the filters to see more keywords."
        action={
          <Button variant="outline" size="sm" onClick={onClearFilters}>
            Clear filters
          </Button>
        }
      />
    );
  }

  return (
    <TableCard>
      <Table>
        <TableHeader>
          <TableRow>
            {/* Unconstrained keyword column absorbs the slack when only a few
                check columns exist, so sparse history doesn't stretch oddly. */}
            <TableHead className="sticky left-0 z-10 w-full bg-card">
              Keyword
            </TableHead>
            {runs.map((r) => (
              <TableHead key={r.runId} className="w-24 text-right">
                {formatDate(r.checkedAt)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {keywords.map((kw) => {
            const byRun = cellByKeyword.get(kw.trackingKeywordId);
            return (
              <TableRow key={kw.trackingKeywordId}>
                <TableCell className="sticky left-0 z-10 bg-card font-medium whitespace-nowrap">
                  {kw.keyword}
                </TableCell>
                {runs.map((r, i) => {
                  const position = byRun?.get(r.runId) ?? null;
                  const previous =
                    i > 0 ? (byRun?.get(runs[i - 1].runId) ?? null) : undefined;
                  return (
                    <TableCell key={r.runId} className="text-right">
                      <MatrixCell position={position} previous={previous} />
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableCard>
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
    return <span className="text-muted-foreground">—</span>;
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
  const runs = sort(
    [...runMap.entries()].map(([runId, checkedAt]) => ({ runId, checkedAt })),
    (a, b) => a.checkedAt.localeCompare(b.checkedAt),
  );
  return { runs, cellByKeyword };
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
