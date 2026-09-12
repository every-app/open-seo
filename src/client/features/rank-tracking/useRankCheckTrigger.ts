import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import { triggerRankCheck } from "@/serverFunctions/rank-tracking";
import { globalTraceStore } from "@/client/features/tracing/globalTraceStore";
import type { GlobalTraceProviderCall } from "@/shared/globalTraceTypes";
import {
  busyBlockedReason,
  providerTaskCount,
  resolveCheckBusyState,
  type RankCheckDevices,
} from "./rankTraceCompletion";

interface CheckTriggerVariables {
  keywordIds?: string[];
  traceOperationId?: string;
}

export function useRankCheckTrigger({
  configId,
  isRunning,
  projectId,
  devices,
  onSuccess,
}: {
  configId: string;
  isRunning: boolean;
  projectId: string;
  /** Device scope of the config — the manual workflow issues one DataForSEO
   * live task per keyword/device pair, so "both" doubles the task count. */
  devices: RankCheckDevices;
  onSuccess: () => void;
}) {
  const queryClient = useQueryClient();
  const currentOpIdRef = useRef<string | null>(null);

  const triggerMutation = useMutation({
    mutationFn: (opts: CheckTriggerVariables) =>
      triggerRankCheck({
        data: {
          projectId,
          configId,
          keywordIds: opts.keywordIds,
          operationId: opts.traceOperationId,
        },
      }),
    onSuccess: (result, opts) => {
      onSuccess();
      void queryClient.invalidateQueries({
        queryKey: ["rankTrackingLatestRun", projectId, configId],
      });

      const opId = opts.traceOperationId ?? currentOpIdRef.current;

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
        // Manual checks always run on the DataForSEO live endpoint (one task
        // per keyword/device pair). HTTP/task outcomes are NOT known yet —
        // they are attached by the polling completion from snapshot evidence,
        // never defaulted here.
        const taskCount = providerTaskCount(validatedCount, devices);
        const providers: GlobalTraceProviderCall[] = Array.from(
          { length: taskCount },
          () => ({
            provider: "DataForSEO",
            endpoint: "v3/serp/google/organic/live/advanced",
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
          provider: `DataForSEO ×${taskCount}`,
          providerCalls: taskCount,
          providerBreakdown: [{ provider: "DataForSEO", count: taskCount }],
          providers,
          metadata: {
            runId: result.runId,
            configId,
          },
        });
      }
    },
    onError: (error, opts) => {
      const message = getStandardErrorMessage(
        error,
        "Failed to start rank check",
      );
      toast.error(message);

      const opId = opts?.traceOperationId ?? currentOpIdRef.current;
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
    const busyState = resolveCheckBusyState({
      isPending: triggerMutation.isPending,
      isRunning,
    });
    if (busyState !== "proceed") {
      // Every click leaves a trace: a busy click is an observable `blocked`
      // operation, never silence (the 0-operations bug).
      const isSelected = Boolean(opts.keywordIds && opts.keywordIds.length > 0);
      try {
        globalTraceStore.recordOperation({
          feature: "rank_tracking",
          operation: isSelected
            ? "rank_tracking.check_selected"
            : "rank_tracking.check_all",
          source: "Rank Tracking page",
          projectId,
          status: "blocked",
          startedAt: Date.now(),
          scope: isSelected ? "selected" : "all",
          selectedCount: opts.keywordIds?.length,
          selectedKeywordIds: opts.keywordIds,
          billing: "Paid",
          metered: true,
          budget: "PASS",
          cache: "Not applicable",
          retry: { attempted: false, count: 0 },
          providerCalls: 0,
          blockedReason: busyBlockedReason(busyState),
        });
      } catch {
        // Tracing must never break the click path.
      }
      toast.info("A rank check is already running");
      return;
    }

    const isSelected = Boolean(opts.keywordIds && opts.keywordIds.length > 0);
    // Trace creation is synchronous and infallible: the RUNNING operation
    // exists before the network request, so even a failed request still
    // leaves an observable FAILED trace. A trace failure must never prevent
    // the rank check itself from executing.
    let opId: string;
    try {
      opId = globalTraceStore.startOperation({
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
    } catch {
      opId = `trace_${Date.now().toString(36)}`;
    }
    currentOpIdRef.current = opId;

    triggerMutation.mutate({ ...opts, traceOperationId: opId });
  };

  return {
    startCheck,
    /** True while the trigger request is in-flight */
    isPending: triggerMutation.isPending,
    /** True when any check activity is happening (running, starting, or pending) */
    isBusy: isRunning || triggerMutation.isPending,
  };
}
