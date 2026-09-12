import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import { triggerRankCheck } from "@/serverFunctions/rank-tracking";
import { globalTraceStore } from "@/client/features/tracing/globalTraceStore";
import type { GlobalTraceProviderCall } from "@/shared/globalTraceTypes";

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
  const currentOpIdRef = useRef<string | null>(null);

  const triggerMutation = useMutation({
    mutationFn: (opts: { keywordIds?: string[] }) =>
      triggerRankCheck({
        data: {
          projectId,
          configId,
          keywordIds: opts.keywordIds,
        },
      }),
    onSuccess: (result, opts) => {
      onSuccess();
      void queryClient.invalidateQueries({
        queryKey: ["rankTrackingLatestRun", projectId, configId],
      });

      const opId = currentOpIdRef.current;

      if (!result.ok) {
        toast.info("A rank check is already running");
        if (opId) {
          globalTraceStore.completeOperation(opId, {
            status: "blocked",
            budget: "PASS",
            blockedReason: "A rank check is already running",
            providerCalls: 0,
          });
        }
        return;
      }

      captureClientEvent("rank_tracking:check_trigger", {
        scope: opts.keywordIds ? "selected" : "all",
        selected_count: opts.keywordIds?.length ?? undefined,
      });
      toast.success(
        opts.keywordIds
          ? `Rank check started for ${opts.keywordIds.length} selected keyword${opts.keywordIds.length !== 1 ? "s" : ""}`
          : "Rank check started",
      );

      if (opId) {
        const validatedCount =
          result.validatedCount ?? opts.keywordIds?.length ?? 1;
        const validatedIds =
          result.validatedKeywordIds ?? opts.keywordIds ?? [];

        const providers: GlobalTraceProviderCall[] = Array.from(
          { length: validatedCount },
          () => ({
            provider: "DataForSEO",
            endpoint: "v3/serp/google/organic/live/advanced",
            httpStatus: 200,
            taskStatus: 20000,
            transport: "HTTP",
            billing: "Paid",
            metered: true,
            budgetGuard: "PASS",
          }),
        );

        globalTraceStore.updateOperation(opId, {
          scope: result.scope ?? (opts.keywordIds ? "selected" : "all"),
          selectedCount: result.selectedCount ?? opts.keywordIds?.length,
          validatedCount,
          rankChecksStarted: validatedCount,
          rankChecksSkipped: result.unselectedCount ?? 0,
          selectedKeywordIds: validatedIds,
          provider: `DataForSEO ×${validatedCount}`,
          providerCalls: validatedCount,
          providerBreakdown: [{ provider: "DataForSEO", count: validatedCount }],
          providers,
          httpStatus: 200,
          metadata: {
            runId: result.runId,
            configId,
          },
        });
      }
    },
    onError: (error) => {
      const message = getStandardErrorMessage(
        error,
        "Failed to start rank check",
      );
      toast.error(message);

      const opId = currentOpIdRef.current;
      if (opId) {
        const isBudgetBlocked =
          message.toLowerCase().includes("credit") ||
          message.toLowerCase().includes("budget") ||
          message.toLowerCase().includes("upgrade") ||
          message.toLowerCase().includes("payment");

        globalTraceStore.completeOperation(opId, {
          status: isBudgetBlocked ? "blocked" : "failed",
          budget: isBudgetBlocked ? "BLOCKED" : "PASS",
          blockedReason: isBudgetBlocked ? message : undefined,
          providerCalls: 0,
          httpStatus: isBudgetBlocked ? 402 : 500,
          errorClass: isBudgetBlocked
            ? "CREDITS_UNAVAILABLE"
            : "TRIGGER_CHECK_FAILED",
          errorMessage: message,
        });
      }
    },
  });

  const startCheck = (opts: { keywordIds?: string[] }) => {
    if (triggerMutation.isPending || isRunning) return;

    const isSelected = Boolean(opts.keywordIds && opts.keywordIds.length > 0);
    const opId = globalTraceStore.startOperation({
      feature: "rank_tracking",
      operation: isSelected
        ? "rank_tracking.check_selected"
        : "rank_tracking.check_all",
      source: "Rank Tracking page",
      projectId,
      scope: isSelected ? "selected" : "all",
      selectedCount: opts.keywordIds?.length,
      selectedKeywordIds: opts.keywordIds,
      billing: "Paid",
      metered: true,
      budget: "PASS",
      cache: "Not applicable",
      retry: { attempted: false, count: 0 },
    });
    currentOpIdRef.current = opId;

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
