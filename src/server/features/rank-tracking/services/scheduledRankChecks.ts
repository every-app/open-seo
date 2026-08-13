import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import { beginRankCheckRun } from "@/server/features/rank-tracking/services/rankCheckRunGuards";
import { customerHasPaidPlan } from "@/server/billing/subscription";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import {
  computeNextCheckAt,
  devicesCount,
  isScheduledRankTrackingInterval,
} from "@/shared/rank-tracking";

// Work admitted per tick, in task units (keywords × devices). Admission
// control, not a hard rate limit: the first start of a tick is always
// admitted, so a config bigger than the budget (legal max: 1,000 keywords ×
// 2 devices = 2,000 units) can never starve. Sized against DataForSEO's
// 2,000 requests/min account cap, where task_get polling is the binding
// term: one call per unit per poll round, rounds wake synchronized per tick,
// and up to three ticks' ~15-minute poll windows overlap the */5 cron — so a
// full tick can burst ~1,000 polls into a single minute, stacking with the
// residual rounds of the two prior ticks. Overruns aren't
// loud failures: throttled polls age into the live fallback at ~3× cost,
// billed to the customer, so keep real headroom under the cap.
// 1,000/tick ≈ 288,000 units/day, ~45× steady-state demand — it only binds
// during backlog catch-up.
const SCHEDULED_TASK_UNIT_BUDGET = 1000;

// Wall-clock guard for the per-config loop: sub-hourly crons are killed at 15
// minutes, and a skip-heavy tick pays serial Autumn round-trips per distinct
// org (worst case minutes, more when Autumn is degraded). Stopping early is
// safe — unprocessed configs stay due and the next tick resumes oldest-first.
const TICK_DEADLINE_MS = 3 * 60_000;

// Cap on the per-tick list of configs blocked by an active run. Blocked
// configs leave no durable trace on their row, so the summary names them.
const ALREADY_RUNNING_IDS_CAP = 20;

// Cron body for the `scheduled` Worker handler: start a rank-check run for every
// config that's due. Wrapped in `withPgClient` at the entrypoint (server.ts).
export async function runScheduledRankChecks(env: Env) {
  const nowIso = new Date().toISOString();
  const dueConfigs =
    await RankTrackingRepository.getDueConfigsWithOrganization(nowIso);
  const isHosted = await isHostedServerAuthMode();
  const keywordCounts = await RankTrackingRepository.getKeywordCountsForConfigs(
    dueConfigs.map((config) => config.id),
  );

  // Function-local so it lives exactly one tick: at module scope this would be
  // cross-invocation global state in Workers, and a rejection would be cached
  // forever. Within a tick, a rejection staying memoized is intentional — one
  // Autumn call per org, and that org's configs simply stay due.
  const paidPlanChecks = new Map<string, Promise<boolean>>();
  const checkPaidPlan = (organizationId: string) => {
    let check = paidPlanChecks.get(organizationId);
    if (!check) {
      check = customerHasPaidPlan(organizationId, { retryDenied: true });
      paidPlanChecks.set(organizationId, check);
    }
    return check;
  };

  const deadline = Date.now() + TICK_DEADLINE_MS;
  let unitsStarted = 0;
  let started = 0;
  let stoppedByBudget = false;
  let stoppedByDeadline = false;
  let skippedFree = 0;
  let skippedNoKeywords = 0;
  let concurrentChangeSkips = 0;
  let alreadyRunning = 0;
  const alreadyRunningConfigIds: string[] = [];
  let planCheckErrors = 0;
  let workflowStartErrors = 0;
  let configErrors = 0;

  for (const config of dueConfigs) {
    if (Date.now() >= deadline) {
      stoppedByDeadline = true;
      break;
    }
    // Per-config containment: one bad row (e.g. malformed next_check_at, which
    // sorts first and would head every scan) or transient DB error must not
    // starve the rest of the tick or suppress the summary log.
    try {
      const interval = isScheduledRankTrackingInterval(config.scheduleInterval)
        ? config.scheduleInterval
        : null;
      // Unreachable: the due query excludes manual configs and NULL next check
      // times. Narrow rather than assert so a query change can't produce a run
      // with no schedule anchor.
      if (!interval || !config.nextCheckAt) continue;

      const kwCount = keywordCounts.get(config.id) ?? 0;
      const taskUnits = kwCount * devicesCount(config.devices);
      // Projected stop: admit only what fits the budget. The first start of a
      // tick is exempt so an oversized config can never starve, and zero-unit
      // rows (no keywords) always advance.
      if (
        started > 0 &&
        unitsStarted + taskUnits > SCHEDULED_TASK_UNIT_BUDGET
      ) {
        stoppedByBudget = true;
        break;
      }

      const observedNextCheckAt = config.nextCheckAt;
      const nextCheckAt = computeNextCheckAt(interval, observedNextCheckAt);

      if (kwCount === 0) {
        const claimed = await RankTrackingRepository.claimDueConfig({
          configId: config.id,
          projectId: config.projectId,
          observedNextCheckAt,
          nextCheckAt,
          lastSkipReason: "no_keywords",
        });
        if (claimed) skippedNoKeywords++;
        else concurrentChangeSkips++;
        continue;
      }

      // Self-hosted deployments treat every config as paid and make no Autumn
      // calls at all.
      let hasPaidPlan = true;
      if (isHosted) {
        try {
          hasPaidPlan = await checkPaidPlan(config.organizationId);
        } catch (err) {
          // Never write nextCheckAt on an error: it is the schedule anchor, so
          // an error write would permanently shift this config's slot and
          // herd-sync configs after an outage. Leaving the row due is the retry.
          console.error(
            `[cron] Plan check failed for config ${config.id} (${config.domain}):`,
            err,
          );
          planCheckErrors++;
          continue;
        }
      }

      if (!hasPaidPlan) {
        const claimed = await RankTrackingRepository.claimDueConfig({
          configId: config.id,
          projectId: config.projectId,
          observedNextCheckAt,
          nextCheckAt,
          lastSkipReason: "plan_required",
        });
        if (claimed) skippedFree++;
        else concurrentChangeSkips++;
        continue;
      }

      // Claim the slot before starting. Clearing lastSkipReason here is what
      // lets an upgraded org drop the "plan_required" badge — the workflow only
      // writes null on a fully successful run.
      const claimed = await RankTrackingRepository.claimDueConfig({
        configId: config.id,
        projectId: config.projectId,
        observedNextCheckAt,
        nextCheckAt,
        lastSkipReason: null,
      });
      if (!claimed) {
        concurrentChangeSkips++;
        continue;
      }

      let result;
      try {
        result = await beginRankCheckRun({
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
      } catch (err) {
        // Leave the schedule advanced: a systemic Workflows outage must not
        // make hundreds of configs due again on the next tick.
        workflowStartErrors++;
        console.error(
          `[cron] Failed to start scheduled rank check for config ${config.id} (${config.domain}):`,
          err,
        );
        continue;
      }

      if (result.ok) {
        unitsStarted += taskUnits;
        started++;
        continue;
      }

      alreadyRunning++;
      if (alreadyRunningConfigIds.length < ALREADY_RUNNING_IDS_CAP) {
        alreadyRunningConfigIds.push(config.id);
      }
      // Nothing was started, so give the slot back and retry next tick once the
      // blocking run clears. A manual edit landing in between wins the CAS.
      const restored = await RankTrackingRepository.claimDueConfig({
        configId: config.id,
        projectId: config.projectId,
        observedNextCheckAt: nextCheckAt,
        nextCheckAt: observedNextCheckAt,
      });
      if (!restored) {
        console.log(
          `[cron] Could not restore schedule for config ${config.id} (${config.domain}) — changed concurrently`,
        );
      }
    } catch (err) {
      configErrors++;
      console.error(
        `[cron] Error processing config ${config.id} (${config.domain}):`,
        err,
      );
    }
  }

  // Oldest by the due query's next_check_at ASC ordering.
  const oldestDue = dueConfigs[0]?.nextCheckAt;
  // Object argument (not an interpolated string) so Workers Logs indexes the
  // fields. Error level when anything failed, so ticks that need attention
  // surface in error-filtered views.
  const logSummary =
    planCheckErrors + workflowStartErrors + configErrors > 0
      ? console.error
      : console.log;
  logSummary({
    event: "rank_tracking_scheduler_summary",
    candidates: dueConfigs.length,
    started,
    unitsStarted,
    budget: SCHEDULED_TASK_UNIT_BUDGET,
    stoppedByBudget,
    stoppedByDeadline,
    skippedFree,
    skippedNoKeywords,
    concurrentChangeSkips,
    alreadyRunning,
    alreadyRunningConfigIds,
    planCheckErrors,
    workflowStartErrors,
    configErrors,
    oldestDueAgeMs: oldestDue
      ? Date.now() - new Date(oldestDue).getTime()
      : null,
  });
}
