import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import { beginRankCheckRun } from "@/server/features/rank-tracking/services/rankCheckRunGuards";
import { customerHasPaidPlan } from "@/server/billing/subscription";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import {
  computeNextCheckAt,
  isScheduledRankTrackingInterval,
} from "@/shared/rank-tracking";

async function advanceNextCheckAt(config: {
  id: string;
  projectId: string;
  scheduleInterval: string | null;
  nextCheckAt: string | null;
}) {
  const interval = isScheduledRankTrackingInterval(config.scheduleInterval)
    ? config.scheduleInterval
    : null;
  if (!interval) return;
  await RankTrackingRepository.updateConfig(config.id, config.projectId, {
    nextCheckAt: computeNextCheckAt(interval, config.nextCheckAt),
  });
}

// Cron body for the `scheduled` Worker handler: start a rank-check run for every
// config that's due. Wrapped in `withPgClient` at the entrypoint (server.ts).
export async function runScheduledRankChecks(env: Env) {
  const nowIso = new Date().toISOString();
  const dueConfigs =
    await RankTrackingRepository.getDueConfigsWithOrganization(nowIso);

  const isHosted = await isHostedServerAuthMode();

  for (const config of dueConfigs) {
    try {
      // Skip unpaid orgs, but still advance nextCheckAt. Leaving unpaid rows
      // due forever fills the 50-config cron limit and starves paying orgs.
      if (isHosted && !(await customerHasPaidPlan(config.organizationId))) {
        console.log(
          `[cron] Skipping config ${config.id} (${config.domain}) — unpaid plan`,
        );
        await advanceNextCheckAt(config);
        continue;
      }

      // Skip configs with no keywords before advancing the schedule
      const kwCount = await RankTrackingRepository.getKeywordCountForConfig(
        config.id,
      );
      if (kwCount === 0) {
        console.log(
          `[cron] Skipping config ${config.id} (${config.domain}) — no keywords`,
        );
        await advanceNextCheckAt(config);
        continue;
      }

      // Advance nextCheckAt immediately to prevent retry storms if the run fails
      await advanceNextCheckAt(config);

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
        keywordsTotal: kwCount,
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
