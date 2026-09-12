import { useRef } from "react";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { getLatestRankRun } from "@/serverFunctions/rank-tracking";
import { globalTraceStore } from "@/client/features/tracing/globalTraceStore";
import type { GlobalTraceOperation } from "@/shared/globalTraceTypes";
import type { RankTrackingRow } from "@/types/schemas/rank-tracking";
import { buildRankCompletionPatch } from "./rankTraceCompletion";

type LatestRun = Awaited<ReturnType<typeof getLatestRankRun>>;

function findTraceForRun(
  runId: string,
  projectId: string,
): GlobalTraceOperation | undefined {
  return globalTraceStore
    .getOperations(projectId)
    .find(
      (op) =>
        op.feature === "rank_tracking" &&
        op.status === "running" &&
        (op.metadata as { runId?: unknown } | undefined)?.runId === runId,
    );
}

/**
 * Polls the latest rank check run for a config, auto-refreshing results
 * when a run transitions from "running" to "completed".
 * Also feeds the Global Debug Trace with real-time run progress and honest
 * completion: per-keyword children are derived from snapshot evidence only
 * (fresh snapshot + position → success, fresh snapshot + no position →
 * no_result, no snapshot → failed). Nothing is fabricated.
 */
export function useRankRunPolling(projectId: string, configId: string) {
  const queryClient = useQueryClient();
  const prevStatusRef = useRef<string | undefined>(undefined);
  // Runs that were already terminal when this hook mounted (page opened
  // mid/late-run) still need to finalize their trace exactly once.
  const finalizedRunIdsRef = useRef<Set<string>>(new Set());

  const { data: latestRun } = useQuery({
    queryKey: ["rankTrackingLatestRun", projectId, configId],
    queryFn: () => getLatestRankRun({ data: { projectId, configId } }),
    refetchInterval: (query) => {
      const run = query.state.data;
      prevStatusRef.current = run?.status;

      if (run && (run.status === "running" || run.status === "pending")) {
        const activeOp = findTraceForRun(run.id, projectId);
        if (activeOp) {
          globalTraceStore.updateOperation(activeOp.operationId, {
            rankChecksSucceeded: run.keywordsChecked,
            counters: {
              checked: run.keywordsChecked,
              total: run.keywordsTotal,
            },
          });
        }
      }

      // When a run reaches a terminal state, invalidate results & finalize
      // the correlated trace. Finalization is keyed by run id (idempotent —
      // a second call finds no RUNNING op), so this also covers the
      // mount-after-terminal case: a page opened while/after the run
      // finished still completes its trace instead of leaving it RUNNING
      // forever.
      const isTerminal =
        run?.status === "completed" || run?.status === "failed";
      if (run && isTerminal && !finalizedRunIdsRef.current.has(run.id)) {
        finalizedRunIdsRef.current.add(run.id);
        void finalizeTraceForRun(run, queryClient, projectId, configId);
      }

      // Keep polling active runs, including stale ones (they'll be cleaned up
      // by the cron handler and we want to show the transition).
      if (run?.status === "pending" || run?.status === "running") return 3000;
      return false;
    },
  });

  return latestRun;
}

async function finalizeTraceForRun(
  run: NonNullable<LatestRun>,
  queryClient: QueryClient,
  projectId: string,
  configId: string,
): Promise<void> {
  const activeOp = findTraceForRun(run.id, projectId);
  if (!activeOp) return;

  try {
    // Refresh the table's own results queries (prefix-matched, so every
    // compare-period variant) and await them: children must be built from
    // fresh snapshots, not the pre-run cache. This reuses the table's
    // queries — no divergent cache keys, no extra provider calls.
    const resultsPrefix = ["rankTrackingResults", projectId, configId];
    try {
      await queryClient.refetchQueries({
        queryKey: resultsPrefix,
        type: "active",
      });
    } catch {
      // Best effort — fall through to whatever the cache holds.
    }
    void queryClient.invalidateQueries({ queryKey: resultsPrefix });
    const cached = queryClient.getQueriesData<{
      rows?: RankTrackingRow[];
    }>({ queryKey: resultsPrefix });
    let effectiveRows: RankTrackingRow[] = [];
    for (const [, data] of cached) {
      if (data?.rows && data.rows.length > effectiveRows.length) {
        effectiveRows = data.rows;
      }
    }

    const targetIds =
      activeOp.selectedKeywordIds && activeOp.selectedKeywordIds.length > 0
        ? activeOp.selectedKeywordIds
        : effectiveRows.map((r) => r.trackingKeywordId);

    const patch = buildRankCompletionPatch({
      run: {
        id: run.id,
        status: run.status,
        keywordsChecked: run.keywordsChecked,
        keywordsTotal: run.keywordsTotal,
        errorMessage: run.errorMessage,
        startedAt: run.startedAt,
      },
      rows: effectiveRows,
      targetIds,
    });

    // Correlate the client trace with the server run for the operation card.
    globalTraceStore.completeOperation(activeOp.operationId, {
      ...patch,
      metadata: {
        ...activeOp.metadata,
        runId: run.id,
        configId,
        keywordsChecked: run.keywordsChecked,
        keywordsTotal: run.keywordsTotal,
      },
    });
  } catch {
    // Trace finalization must never throw out of the polling loop.
    try {
      globalTraceStore.completeOperation(activeOp.operationId, {
        status: run.status === "failed" ? "failed" : "success",
        errorMessage: run.errorMessage || undefined,
      });
    } catch {
      // Best effort only.
    }
  }
}
