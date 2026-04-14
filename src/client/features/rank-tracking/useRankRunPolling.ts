import { useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getLatestRankRun } from "@/serverFunctions/rank-tracking";

/**
 * Polls the latest rank check run for a config, auto-refreshing results
 * when a run transitions from "running" to "completed".
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

      // When a run transitions to a terminal state, invalidate results
      const isTerminal =
        run?.status === "completed" || run?.status === "failed";
      const wasActive = prev === "running" || prev === "pending";
      if (wasActive && isTerminal) {
        void queryClient.invalidateQueries({
          queryKey: ["rankTrackingResults", projectId, configId],
        });
      }

      // Keep polling active runs, including stale ones (they'll be cleaned up
      // by the cron handler and we want to show the transition).
      if (run?.status === "pending" || run?.status === "running") return 3000;
      return false;
    },
  });

  return latestRun;
}
