import { AppError } from "@/server/lib/errors";
import {
  computeNextCheckAt,
  isScheduledRankTrackingInterval,
} from "@/shared/rank-tracking";
import type {
  RankCheckScheduleTime,
  RankTrackingConfig,
} from "@/types/schemas/rank-tracking";

export function resolveNextCheckAt(
  scheduleInterval: RankTrackingConfig["scheduleInterval"],
  scheduleTime: RankCheckScheduleTime | undefined,
): string | null {
  if (isScheduledRankTrackingInterval(scheduleInterval)) {
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
