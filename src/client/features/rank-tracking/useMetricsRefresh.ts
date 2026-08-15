import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { refreshTrackingKeywordMetrics } from "@/serverFunctions/rank-tracking";

export function useMetricsRefresh(projectId: string, configId: string) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      refreshTrackingKeywordMetrics({
        data: { projectId, configId },
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({
        queryKey: ["rankTrackingResults", projectId, configId],
      });
      toast.success(`已更新 ${result.updated} 个关键词的指标`);
    },
    onError: () => {
      toast.error("关键词指标刷新失败");
    },
  });
  return { refresh: mutation.mutate, isRefreshing: mutation.isPending };
}
