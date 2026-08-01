import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import { RankTrackingService } from "@/server/features/rank-tracking/services/RankTrackingService";
import { beginRankCheckRun } from "@/server/features/rank-tracking/services/rankCheckRunGuards";
import { customerHasPaidPlan } from "@/server/billing/subscription";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import {
  computeNextCheckAt,
  isScheduledRankTrackingInterval,
} from "@/shared/rank-tracking";

// Cron body for the `scheduled` Worker handler: start a rank-check run for every
// config that's due. Wrapped in `withPgClient` at the entrypoint (server.ts).
export async function runScheduledRankChecks(env: Env) {
  const nowIso = new Date().toISOString();
  const dueConfigs =
    await RankTrackingRepository.getDueConfigsWithOrganization(nowIso);

  const isHosted = await isHostedServerAuthMode();

  for (const config of dueConfigs) {
    try {
      // Skip configs whose org doesn't have a paid plan
      if (isHosted && !(await customerHasPaidPlan(config.organizationId))) {
        continue;
      }

      // Fetch the keywords themselves, not just a count: each one can carry its
      // own interval override, so which keywords are due is a per-keyword question.
      const keywords = await RankTrackingRepository.getKeywordsForConfig(
        config.id,
      );
      if (keywords.length === 0) {
        console.log(
          `[cron] Skipping config ${config.id} (${config.domain}) — no keywords`,
        );
        // Still advance schedule so this config doesn't stay due forever
        const skipInterval = isScheduledRankTrackingInterval(
          config.scheduleInterval,
        )
          ? config.scheduleInterval
          : null;
        if (skipInterval) {
          await RankTrackingRepository.updateConfig(
            config.id,
            config.projectId,
            {
              nextCheckAt: computeNextCheckAt(skipInterval, config.nextCheckAt),
            },
          );
        }
        continue;
      }

      const dueKeywords = RankTrackingService.getDueKeywordsForScheduledRun(
        config,
        keywords,
        nowIso,
      );
      if (dueKeywords.length === 0) {
        console.log(
          `[cron] Skipping config ${config.id} (${config.domain}) — no due keywords`,
        );
        if (isScheduledRankTrackingInterval(config.scheduleInterval)) {
          await RankTrackingRepository.updateConfig(
            config.id,
            config.projectId,
            {
              nextCheckAt: computeNextCheckAt(
                config.scheduleInterval,
                config.nextCheckAt,
              ),
            },
          );
        }
        continue;
      }

      // Advance nextCheckAt immediately to prevent retry storms if the run fails
      const interval = isScheduledRankTrackingInterval(config.scheduleInterval)
        ? config.scheduleInterval
        : null;
      if (interval) {
        await RankTrackingRepository.updateConfig(config.id, config.projectId, {
          nextCheckAt: computeNextCheckAt(interval, config.nextCheckAt),
        });
      }

      await RankTrackingService.advanceKeywordSchedulesForScheduledRun(
        dueKeywords,
      );

      // Only pass keywordIds when running a subset, so a full run keeps its
      // existing "all keywords" shape.
      const keywordIds =
        dueKeywords.length === keywords.length
          ? undefined
          : dueKeywords.map((keyword) => keyword.id);

      const result = await beginRankCheckRun({
        workflow: env.RANK_CHECK_WORKFLOW,
        config,
        projectId: config.projectId,
        billingCustomer: {
          userId: "system",
          userEmail: "system@openseo.so",
          organizationId: config.organizationId,
          projectId: config.projectId,
        },
        keywordsTotal: keywordIds ? keywordIds.length : keywords.length,
        keywordIds,
        trigger: "scheduled",
        workflowStartErrorMessage: "Failed to start scheduled workflow",
      });

      if (!result.ok) {
        console.log(
          `[cron] Skipping config ${config.id} (${config.domain}) — run already active`,
        );
      } else {
        console.log(
          `[cron] Started scheduled rank check ${result.runId} for config ${config.id} (${config.domain})`,
        );
      }
    } catch (err) {
      console.error(
        `[cron] Error processing config ${config.id} (${config.domain}):`,
        err,
      );
    }
  }
}
