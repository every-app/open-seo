import { AiVisibilityRepository as repo } from "../repositories/AiVisibilityRepository";
import { AiVisibilityError } from "./aiVisibilityErrors";
import { activeAiPrompts } from "./aiVisibilityConfiguration";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import type { AiRun } from "@/shared/ai-visibility";
import type { SetAiScheduleInput } from "@/types/schemas/ai-visibility";
import { computeNextCheckAt } from "@/shared/rank-tracking";
import { requireConfiguration } from "./aiVisibilityMutation";
import { getTracker } from "./aiVisibilityState";
import { startRun } from "./aiVisibilityRuns";

/**
 * Enables, reschedules or pauses tracking. The first enable also collects a
 * baseline now; an overdue next check is picked up by the scheduler.
 */
export async function setSchedule(
  input: SetAiScheduleInput,
  billing: BillingCustomerContext,
): Promise<{
  state: Awaited<ReturnType<typeof getTracker>>;
  run: AiRun | null;
}> {
  const config = await requireConfiguration(input.projectId);
  const { tracker } = config;
  if (!input.enabled) {
    await repo.updateTracker(tracker.id, { enabled: false });
    return { state: await getTracker(input), run: null };
  }
  if (!activeAiPrompts(config).length)
    throw new AiVisibilityError(
      "NO_ACTIVE_PROMPTS",
      "Add active prompts before enabling scheduled tracking.",
    );
  if (!(await getOptionalEnvValue("DATAFORSEO_API_KEY")))
    throw new AiVisibilityError(
      "PROVIDER_NOT_CONFIGURED",
      "Configure DataForSEO before enabling collection. Setup remains available.",
    );
  const scheduleInterval = input.scheduleInterval ?? tracker.scheduleInterval;
  // The stored next check is the chosen slot. An unchanged schedule keeps it.
  const nextCheckAt =
    input.scheduleTime ||
    scheduleInterval !== tracker.scheduleInterval ||
    !tracker.nextCheckAt
      ? computeNextCheckAt(scheduleInterval, null, input.scheduleTime)
      : tracker.nextCheckAt;
  await repo.updateTracker(tracker.id, {
    enabled: true,
    scheduleInterval,
    nextCheckAt,
    lastSkipReason: null,
  });
  let run: AiRun | null = null;
  if (!(await repo.getLatestScheduledRun(input.projectId))) {
    try {
      run = await startRun(config, "baseline", billing);
    } catch (error) {
      // A check already running stands in for the baseline.
      if (
        !(error instanceof AiVisibilityError) ||
        error.reason !== "RUN_IN_PROGRESS"
      )
        throw error;
    }
  }
  return { state: await getTracker(input), run };
}
