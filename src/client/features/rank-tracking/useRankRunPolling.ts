import { useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getLatestRankRun } from "@/serverFunctions/rank-tracking";

/**
 * Polls the latest rank check run for a config, auto-refreshing results
 * and history when it observes a completed or failed run.
 */
export function useRankRunPolling(projectId: string, configId: string) {
  const queryClient = useQueryClient();
  const lastTerminalRunRef = useRef<string | undefined>(undefined);

  const { data: latestRun } = useQuery({
    queryKey: ["rankTrackingLatestRun", projectId, configId],
    queryFn: () => getLatestRankRun({ data: { projectId, configId } }),
    refetchInterval: (query) => {
      const run = query.state.data;
      // A run can start and finish between polls, without an active observation.
      const isTerminal =
        run?.status === "completed" || run?.status === "failed";
      const terminalRunKey = `${projectId}:${configId}:${run?.id}:${run?.status}`;
      if (isTerminal && lastTerminalRunRef.current !== terminalRunKey) {
        lastTerminalRunRef.current = terminalRunKey;
        void queryClient.invalidateQueries({
          queryKey: ["rankTrackingResults", projectId, configId],
        });
        void queryClient.invalidateQueries({
          queryKey: ["rankConfigTrend", projectId, configId],
        });
        void queryClient.invalidateQueries({
          queryKey: ["rankPositionMatrix", projectId, configId],
        });
        void queryClient.invalidateQueries({
          queryKey: ["rankKeywordHistory", projectId, configId],
        });
      }

      // Keep polling active runs, including stale ones (they'll be cleaned up
      // by the cron handler and we want to show the transition).
      if (run?.status === "pending" || run?.status === "running") return 3000;
      // Discover scheduled checks and checks started from another client.
      return 30_000;
    },
  });

  return latestRun;
}
