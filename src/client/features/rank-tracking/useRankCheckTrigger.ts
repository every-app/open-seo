import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import { triggerRankCheck } from "@/serverFunctions/rank-tracking";

export function useRankCheckTrigger({
  configId,
  isRunning,
  projectId,
  onSuccess,
}: {
  configId: string;
  isRunning: boolean;
  projectId: string;
  onSuccess: () => void;
}) {
  const queryClient = useQueryClient();

  const triggerMutation = useMutation({
    mutationFn: (opts: { keywordIds?: string[] }) =>
      triggerRankCheck({
        data: {
          projectId,
          configId,
          keywordIds: opts.keywordIds,
        },
      }),
    onSuccess: (result) => {
      onSuccess();
      void queryClient.invalidateQueries({
        queryKey: ["rankTrackingLatestRun", projectId, configId],
      });
      if (!result.ok) {
        toast.info("已有排名检查正在运行");
        return;
      }

      captureClientEvent("rank_tracking:check_trigger");
      toast.success("排名检查已开始");
    },
    onError: (error) => {
      toast.error(getStandardErrorMessage(error, "排名检查启动失败"));
    },
  });

  const startCheck = (opts: { keywordIds?: string[] }) => {
    if (triggerMutation.isPending || isRunning) return;
    triggerMutation.mutate(opts);
  };

  return {
    startCheck,
    /** True while the trigger request is in-flight */
    isPending: triggerMutation.isPending,
    /** True when any check activity is happening (running, starting, or pending) */
    isBusy: isRunning || triggerMutation.isPending,
  };
}
