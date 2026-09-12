import { useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getLatestRankRun } from "@/serverFunctions/rank-tracking";
import { globalTraceStore } from "@/client/features/tracing/globalTraceStore";
import type { GlobalTraceKeywordChild } from "@/shared/globalTraceTypes";
import type { RankTrackingRow } from "@/types/schemas/rank-tracking";

/**
 * Polls the latest rank check run for a config, auto-refreshing results
 * when a run transitions from "running" to "completed".
 * Also feeds the Global Debug Trace with real-time run progress and child operations.
 */
export function useRankRunPolling(projectId: string, configId: string) {
  const queryClient = useQueryClient();
  const prevStatusRef = useRef<string | undefined>(undefined);

  const { data: latestRun } = useQuery({
    queryKey: ["rankTrackingLatestRun", projectId, configId],
    queryFn: () => getLatestRankRun({ data: { projectId, configId } }),
    refetchInterval: (query) => {
      const run = query.state.data;
      const prev = prevStatusRef.current;
      prevStatusRef.current = run?.status;

      // Update Global Trace with live progress
      const activeOp = globalTraceStore.findActiveOperationByFeature(
        "rank_tracking",
        projectId,
      );
      if (activeOp && (run?.status === "running" || run?.status === "pending")) {
        globalTraceStore.updateOperation(activeOp.operationId, {
          rankChecksSucceeded: run.keywordsChecked,
          counters: {
            checked: run.keywordsChecked,
            total: run.keywordsTotal,
          },
        });
      }

      // When a run transitions to a terminal state, invalidate results & finalize trace
      const isTerminal =
        run?.status === "completed" || run?.status === "failed";
      const wasActive = prev === "running" || prev === "pending";
      if (wasActive && isTerminal) {
        void queryClient.invalidateQueries({
          queryKey: ["rankTrackingResults", projectId, configId],
        });

        if (activeOp) {
          if (run?.status === "completed") {
            const resultsData = queryClient.getQueryData<{
              rows?: RankTrackingRow[];
            }>(["rankTrackingResults", projectId, configId]);
            const rows = resultsData?.rows ?? [];
            const rowMap = new Map(rows.map((r) => [r.trackingKeywordId, r]));

            const targetIds =
              activeOp.selectedKeywordIds ??
              rows.map((r) => r.trackingKeywordId);

            const children: GlobalTraceKeywordChild[] = targetIds.map((id) => {
              const row = rowMap.get(id);
              return {
                keywordId: id,
                keyword: row?.keyword,
                status: "success",
                provider: "DataForSEO",
                positionBefore:
                  row?.desktop?.previousPosition ??
                  row?.mobile?.previousPosition ??
                  null,
                positionAfter:
                  row?.desktop?.position ?? row?.mobile?.position ?? null,
                httpStatus: 200,
                taskStatus: 20000,
              };
            });

            globalTraceStore.completeOperation(activeOp.operationId, {
              status: "success",
              rankChecksSucceeded:
                run.keywordsChecked ||
                activeOp.validatedCount ||
                targetIds.length,
              rankChecksFailed: Math.max(
                0,
                (run.keywordsTotal || targetIds.length) -
                  (run.keywordsChecked || targetIds.length),
              ),
              children,
            });
          } else if (run?.status === "failed") {
            globalTraceStore.completeOperation(activeOp.operationId, {
              status: "failed",
              errorMessage: run.errorMessage || "Rank check failed",
            });
          }
        }
      }

      // Keep polling active runs, including stale ones (they'll be cleaned up
      // by the cron handler and we want to show the transition).
      if (run?.status === "pending" || run?.status === "running") return 3000;
      return false;
    },
  });

  return latestRun;
}
