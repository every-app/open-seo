import { AppError } from "@/server/lib/errors";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { SCHEDULED_RANK_CHECKS_PAUSED } from "@/shared/rank-tracking-pause";
import {
  computeNextCheckAt,
  isScheduledRankTrackingInterval,
} from "@/shared/rank-tracking";
import type {
  RankCheckScheduleTime,
  RankTrackingConfig,
} from "@/types/schemas/rank-tracking";

export async function resolveNextCheckAt(
  scheduleInterval: RankTrackingConfig["scheduleInterval"],
  scheduleTime: RankCheckScheduleTime | undefined,
): Promise<string | null> {
  if (isScheduledRankTrackingInterval(scheduleInterval)) {
    // Reached only when a schedule is created or changed, so configs keep the
    // schedule they already have (and resume when the pause lifts).
    if (SCHEDULED_RANK_CHECKS_PAUSED && (await isHostedServerAuthMode())) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Scheduled rank checks are temporarily paused. Use a manual schedule and run checks on demand.",
      );
    }
    // Without one the check would quietly repeat on whatever day today is.
    if (
      scheduleInterval === "weekly" &&
      scheduleTime &&
      scheduleTime.weekday === undefined
    ) {
      throw new AppError(
        "VALIDATION_ERROR",
        "A weekly schedule time needs a weekday",
      );
    }
    return computeNextCheckAt(scheduleInterval, null, scheduleTime);
  }
  if (scheduleTime) {
    throw new AppError(
      "VALIDATION_ERROR",
      "A schedule time needs a daily, weekly, or monthly schedule",
    );
  }
  return null;
}
