import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import {
  fetchRankTrackingKeywordSchedules,
  rankTrackingKeywordSchedulesQueryKey,
  updateRankTrackingKeywordSchedules,
} from "@/client/features/rank-tracking/RankTrackingTableToolbar";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import type {
  RankTrackingConfig,
  RankTrackingKeywordScheduleInterval,
  RankTrackingRow,
  RankTrackingScheduledRow,
} from "@/types/schemas/rank-tracking";

// Keyword-level schedule state for one config: the fetched overrides, the
// mutation that writes them, and the rows joined with their effective schedule.
export function useKeywordSchedules(options: {
  projectId: string;
  config: Pick<RankTrackingConfig, "id" | "scheduleInterval" | "nextCheckAt">;
  rows: RankTrackingRow[];
  enabled: boolean;
}) {
  const { projectId, config, rows, enabled } = options;
  const queryClient = useQueryClient();

  const { data: keywordSchedules } = useQuery({
    queryKey: rankTrackingKeywordSchedulesQueryKey(projectId, config.id),
    queryFn: () =>
      fetchRankTrackingKeywordSchedules({ projectId, configId: config.id }),
    enabled,
  });

  const intervalMutation = useMutation({
    mutationFn: (input: {
      keywordIds: string[];
      scheduleIntervalOverride: RankTrackingKeywordScheduleInterval;
    }) =>
      updateRankTrackingKeywordSchedules({
        projectId,
        configId: config.id,
        ...input,
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({
        queryKey: rankTrackingKeywordSchedulesQueryKey(projectId, config.id),
      });
      toast.success(
        `${result.updated} keyword schedule${result.updated !== 1 ? "s" : ""} updated`,
      );
    },
    onError: (error) => {
      toast.error(
        getStandardErrorMessage(error, "Failed to update keyword schedules"),
      );
    },
  });

  const setKeywordIntervals = (
    keywordIds: string[],
    scheduleIntervalOverride: RankTrackingKeywordScheduleInterval,
  ) => {
    if (keywordIds.length === 0) return;
    intervalMutation.mutate({ keywordIds, scheduleIntervalOverride });
  };

  const schedulesById = useMemo(
    () =>
      new Map(
        (keywordSchedules?.keywords ?? []).map((schedule) => [
          schedule.trackingKeywordId,
          schedule,
        ]),
      ),
    [keywordSchedules],
  );

  const rowsWithSchedules = useMemo<RankTrackingScheduledRow[]>(
    () =>
      rows.map((row) => {
        const schedule = schedulesById.get(row.trackingKeywordId);
        const scheduleIntervalOverride =
          schedule?.scheduleIntervalOverride ?? "inherit";
        const effectiveInterval =
          schedule?.effectiveInterval ??
          keywordSchedules?.configScheduleInterval ??
          config.scheduleInterval;
        const nextCheckAt = schedule?.nextCheckAt ?? null;

        return {
          ...row,
          scheduleIntervalOverride,
          effectiveInterval,
          nextCheckAt,
          effectiveNextCheckAt:
            scheduleIntervalOverride === "inherit"
              ? config.nextCheckAt
              : nextCheckAt,
        };
      }),
    [
      rows,
      schedulesById,
      keywordSchedules?.configScheduleInterval,
      config.scheduleInterval,
      config.nextCheckAt,
    ],
  );

  return {
    rowsWithSchedules,
    setKeywordIntervals,
    intervalUpdatePending: intervalMutation.isPending,
  };
}
