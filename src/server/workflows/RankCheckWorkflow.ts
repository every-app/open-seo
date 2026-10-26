/* eslint-disable max-lines -- fork validated runs merged with upstream's live and queued paths */
import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import { withPgClient } from "@/db";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import { failRunIfActive } from "@/server/features/rank-tracking/services/rankCheckRunGuards";
import {
  runLiveCheck,
  runQueuedCheck,
} from "@/server/workflows/rankCheckPaths";
import {
  runQueuedCheck as runValidatedCheck,
  type QueuedCheckStats,
} from "@/server/workflows/rankCheckQueuedPath";
import { retryRankChecks } from "@/server/workflows/rankCheckRetries";
import { pgStep } from "@/server/workflows/pgStep";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { captureServerEvent } from "@/server/lib/posthog";
import { sendCreditsExhaustedEvent } from "@/server/email/onboarding-drip";
import { describeError } from "@/server/lib/errors";
import { autumn } from "@/server/billing/autumn";
import {
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
} from "@/shared/billing";
import {
  estimateRankCheckCredits,
  rankCheckCostApprovalError,
  rankCheckMethod,
  type RankCheckMethod,
  VALIDATED_CRAWLS_PER_PAIR,
} from "@/shared/rank-tracking";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { isErrorCode } from "@/shared/error-codes";

// These steps cost nothing and are safe to repeat: they touch our own rows,
// prepare's Autumn calls only read balances, and its credits email is sent
// once a day. So an engine failure on one attempt does not fail the run. The
// paid batch steps live in rankCheckPaths and run once.
const FREE_STEP_CONFIG = {
  retries: { limit: 2, delay: "10 seconds" as const },
  timeout: "2 minutes" as const,
};

interface RankCheckParams {
  runId: string;
  configId: string;
  billingCustomer: BillingCustomerContext;
  projectId: string;
  domain: string;
  locationCode: number;
  languageCode: string;
  locationName?: string;
  devices: "both" | "desktop" | "mobile";
  serpDepth: number;
  trigger: "manual" | "scheduled";
  /** Fork: queue the check and verify each result's page (runQueuedCheck). */
  validateSerps?: boolean;
  keywordIds?: string[];
  maxCostCredits?: number;
}

async function prepareRankCheckKeywords(input: {
  runId: string;
  configId: string;
  billingCustomer: BillingCustomerContext;
  devices: RankCheckParams["devices"];
  serpDepth: number;
  method: RankCheckMethod;
  /** Crawls per pair the run may spend; its estimate is that worst case. */
  crawlsPerPair: number;
  keywordIds?: string[];
  maxCostCredits?: number;
}) {
  // If stale-cleanup marked our run failed before we got here, bail out
  // rather than resurrecting a superseded run.
  const run = await RankTrackingRepository.getRunById(input.runId);
  if (!run || run.status === "failed" || run.status === "completed") {
    throw new NonRetryableError(
      `Run ${input.runId} is no longer active (status=${run?.status ?? "missing"})`,
    );
  }

  await RankTrackingRepository.updateRun(input.runId, {
    status: "running",
  });

  let trackingKeywords = await RankTrackingRepository.getKeywordsForConfig(
    input.configId,
  );

  if (input.keywordIds && input.keywordIds.length > 0) {
    const idSet = new Set(input.keywordIds);
    trackingKeywords = trackingKeywords.filter((kw) => idSet.has(kw.id));
  }

  // Refusals are not retried: a retry would only repeat them, and send the
  // credits email again.
  if (trackingKeywords.length === 0) {
    throw new NonRetryableError("No keywords to track");
  }

  const { costCredits } = estimateRankCheckCredits(
    trackingKeywords.map((kw) => kw.keyword),
    input.devices,
    input.serpDepth,
    input.method,
    input.crawlsPerPair,
  );
  if (input.maxCostCredits != null && costCredits > input.maxCostCredits) {
    throw new NonRetryableError(
      rankCheckCostApprovalError(costCredits, input.maxCostCredits),
    );
  }

  // Verify the user has enough credits for the full check before starting.
  // Scheduled checks go through the cheaper task queue, so estimate at queued
  // pricing — a live-price estimate would skip checks the user can afford.
  // The estimate is the worst case, so it covers every retry.
  if (await isHostedServerAuthMode()) {
    const [monthlyCheck, topupCheck] = await Promise.all([
      autumn.check({
        customerId: input.billingCustomer.organizationId,
        featureId: AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
      }),
      autumn.check({
        customerId: input.billingCustomer.organizationId,
        featureId: AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
      }),
    ]);
    const available =
      (monthlyCheck.balance?.remaining ?? 0) +
      (topupCheck.balance?.remaining ?? 0);
    if (available < costCredits) {
      await sendCreditsExhaustedEvent(input.billingCustomer);
      // The code alone, so the run's saved error shows the credits card.
      throw new NonRetryableError("INSUFFICIENT_CREDITS");
    }
  }

  await RankTrackingRepository.updateRun(input.runId, {
    keywordsTotal: trackingKeywords.length,
  });

  return {
    keywords: trackingKeywords.map((kw) => ({
      id: kw.id,
      keyword: kw.keyword,
    })),
  };
}

/**
 * Validated runs hold a reading at its previous position instead of writing a
 * doubtful one. The run says so even when every keyword still got a snapshot
 * from its other device, which the snapshot count alone would hide.
 */
function heldReadingsNote(stats: QueuedCheckStats | null): string | null {
  if (!stats) return null;
  const total = stats.withheld + stats.undelivered;
  if (total === 0) return null;
  const parts = [
    stats.withheld > 0
      ? `${stats.withheld} judged a bad page on every crawl`
      : null,
    stats.undelivered > 0
      ? `${stats.undelivered} not delivered or not checkable by the queue in time`
      : null,
  ].filter((part): part is string => part !== null);
  return `Held ${total} reading(s) at their previous position: ${parts.join(", ")}.`;
}

async function finalizeRankCheckRun(input: {
  runId: string;
  configId: string;
  projectId: string;
  billingCustomer: BillingCustomerContext;
  trigger: RankCheckParams["trigger"];
  devices: RankCheckParams["devices"];
  batchError: string | null;
  queueStats: QueuedCheckStats | null;
}) {
  // If stale-cleanup already marked our run failed, don't overwrite that
  // decision with a completed status — a replacement run may already be
  // underway.
  const run = await RankTrackingRepository.getRunById(input.runId);
  if (!run || run.status === "failed" || run.status === "completed") {
    console.warn(
      `[rank-check] ${input.runId} no longer active (status=${run?.status ?? "missing"}), skipping finalization`,
    );
    return;
  }

  const nowIso = new Date().toISOString();

  // Snapshots were written incrementally by each batch step. Count from the
  // DB: a keyword is checked when any device has a snapshot, but the run is
  // partial when any device is missing one, so a lost device still shows.
  const snapshots = await RankTrackingRepository.getSnapshotsForRun(
    input.runId,
  );
  const keywordsChecked = new Set(snapshots.map((s) => s.trackingKeywordId))
    .size;
  const devices: Array<"desktop" | "mobile"> =
    input.devices === "both" ? ["desktop", "mobile"] : [input.devices];
  const checkedByDevice = devices.map((device) => ({
    device,
    count: new Set(
      snapshots
        .filter((s) => s.device === device)
        .map((s) => s.trackingKeywordId),
    ).size,
  }));

  const keywordsTotal = run.keywordsTotal || keywordsChecked;
  const isPartial = checkedByDevice.some((d) => d.count < keywordsTotal);

  // Batch steps record the first per-keyword rejection on the run as it
  // happens, so a failed run shows the vendor's reason rather than a count.
  const keywordError = run.errorMessage ?? input.batchError;
  // A validated run that held every reading still finished its protocol, so
  // only a run with nothing checked and nothing held is a failure.
  const held = heldReadingsNote(input.queueStats);
  const status =
    keywordsChecked === 0 && keywordsTotal > 0 && held === null
      ? "failed"
      : "completed";
  const checkedSummary =
    checkedByDevice.length > 1
      ? checkedByDevice
          .map(({ device, count }) => `${count} of ${keywordsTotal} ${device}`)
          .join(" and ")
      : `${keywordsChecked} of ${keywordsTotal}`;
  const progress = isPartial
    ? `Checked ${checkedSummary} keyword(s)${keywordError ? `: ${keywordError}` : ""}`
    : null;
  const errorMessage =
    status === "failed"
      ? (keywordError ?? "No keywords could be checked.")
      : [progress, held]
          .filter((part): part is string => part !== null)
          .join(" ") || null;

  // Flipping status away from 'pending'/'running' is what releases the
  // partial-index slot for the next run.
  await RankTrackingRepository.updateRun(input.runId, {
    status,
    keywordsChecked,
    completedAt: nowIso,
    errorMessage,
  });

  // Clear any previous skip reason on success. A failed run must not advance
  // lastCheckedAt — nothing was actually checked.
  // Note: nextCheckAt is NOT set here — the cron handler advances it eagerly
  // before starting the workflow to prevent retry storms.
  if (status === "completed") {
    await RankTrackingRepository.updateConfig(input.configId, input.projectId, {
      lastCheckedAt: nowIso,
      lastSkipReason: null,
    });
  }

  // One-line summary per run so fallback rates are visible in Workers Logs.
  // Keys match the PostHog event properties for log/event correlation.
  const queueSummary = input.queueStats
    ? ` queue_tasks=${input.queueStats.queueTasks} queue_collected=${input.queueStats.queueCollected} fallback_tasks=${input.queueStats.fallbackTasks} fallback_checked=${input.queueStats.fallbackChecked} validated=${input.queueStats.validated} location_dropped=${input.queueStats.locationDropped} history_suspect=${input.queueStats.historySuspect} reposted=${input.queueStats.reposted} withheld=${input.queueStats.withheld} undelivered=${input.queueStats.undelivered} html_unavailable=${input.queueStats.htmlUnavailable}`
    : "";
  // Error text can echo vendor/user content — keep it one line and bounded.
  const errorSummary = errorMessage
    ? ` error="${errorMessage.replace(/\s+/g, " ").slice(0, 200)}"`
    : "";
  console.log(
    `[rank-check] ${input.runId} ${status} org=${input.billingCustomer.organizationId} project=${input.projectId} trigger=${input.trigger} keywords=${keywordsChecked}/${keywordsTotal}${queueSummary}${errorSummary}`,
  );

  await captureServerEvent({
    distinctId: input.billingCustomer.userId,
    event: "rank_tracking:check_complete",
    organizationId: input.billingCustomer.organizationId,
    properties: {
      project_id: input.projectId,
      status,
      trigger: input.trigger,
      keywords_checked: keywordsChecked,
      ...(input.queueStats
        ? {
            queue_tasks: input.queueStats.queueTasks,
            queue_collected: input.queueStats.queueCollected,
            fallback_tasks: input.queueStats.fallbackTasks,
            fallback_checked: input.queueStats.fallbackChecked,
            validated: input.queueStats.validated,
            location_dropped: input.queueStats.locationDropped,
            history_suspect: input.queueStats.historySuspect,
            reposted: input.queueStats.reposted,
            withheld: input.queueStats.withheld,
            undelivered: input.queueStats.undelivered,
            html_unavailable: input.queueStats.htmlUnavailable,
          }
        : {}),
    },
  });
}

async function markRankCheckRunFailed(input: {
  runId: string;
  configId: string;
  projectId: string;
  billingCustomer: BillingCustomerContext;
  error: unknown;
}) {
  // run() catches the error the engine rebuilt from the failed step, never
  // the thrown object, with the message prefixed by the error's name. A
  // refusal's bare code under that prefix is what the run keeps, so the
  // credits card shows and the config can say why the check was skipped.
  const message =
    input.error instanceof Error ? input.error.message : "Unknown error";
  const bare = message.replace(/^\w+: /, "");
  const refusal = isErrorCode(bare) ? bare : null;
  await failRunIfActive(input.runId, refusal ?? message);

  if (refusal === "INSUFFICIENT_CREDITS") {
    await RankTrackingRepository.updateConfig(input.configId, input.projectId, {
      lastSkipReason: "insufficient_credits",
    });
  }

  await captureServerEvent({
    distinctId: input.billingCustomer.userId,
    event: "rank_tracking:check_complete",
    organizationId: input.billingCustomer.organizationId,
    properties: {
      project_id: input.projectId,
      status: "failed",
      // A code, not the message: provider errors can quote keywords or domains.
      error_code: refusal ?? "INTERNAL_ERROR",
    },
  });
}

export class RankCheckWorkflow extends WorkflowEntrypoint<
  Env,
  RankCheckParams
> {
  async run(event: WorkflowEvent<RankCheckParams>, step: WorkflowStep) {
    // Scope a per-request Postgres client for this workflow invocation (no-op in
    // D1 mode). The socket is reclaimed when the invocation ends, so there is
    // nothing to tear down here.
    return withPgClient(() => this.runScoped(event, step));
  }

  private async runScoped(
    event: WorkflowEvent<RankCheckParams>,
    step: WorkflowStep,
  ) {
    const {
      runId,
      configId,
      billingCustomer,
      projectId,
      domain,
      locationCode,
      languageCode,
      locationName,
      devices,
      serpDepth,
      trigger,
      validateSerps,
      keywordIds,
      maxCostCredits,
    } = event.payload;
    const method = rankCheckMethod(trigger, validateSerps);

    // Guard: skip if config was archived after the workflow was triggered
    const configCheck = await pgStep(
      step,
      "check-active",
      FREE_STEP_CONFIG,
      async () => {
        const cfg = await RankTrackingRepository.getConfigById({
          configId,
          projectId,
        });
        return { isActive: cfg?.isActive ?? false };
      },
    );
    if (!configCheck.isActive) {
      await failRunIfActive(runId, "Config has been archived");
      return;
    }

    try {
      console.log(
        `[rank-check] ${runId} starting (trigger=${trigger}, devices=${devices}, validate_serps=${validateSerps === true})`,
      );

      const prepareResult = await pgStep(
        step,
        "prepare",
        FREE_STEP_CONFIG,
        async () =>
          prepareRankCheckKeywords({
            runId,
            configId,
            billingCustomer,
            devices,
            serpDepth,
            method,
            crawlsPerPair: validateSerps ? VALIDATED_CRAWLS_PER_PAIR : 1,
            keywordIds,
            maxCostCredits,
          }),
      );

      const keywords = prepareResult.keywords;
      const client = createDataforseoClient(billingCustomer);

      console.log(`[rank-check] ${runId} loaded ${keywords.length} keywords`);

      let batchError: string | null = null;
      let queueStats: QueuedCheckStats | null = null;

      try {
        const checkContext = {
          client,
          configId,
          keywords,
          devices,
          serpDepth,
          domain,
          locationCode,
          languageCode,
          locationName,
          runId,
          validateSerps,
        };
        if (validateSerps) {
          // Fork: a validated run checks every queued result against its own
          // page and holds the doubtful ones at their previous position
          // (rankCheckQueuedPath). It re-crawls those itself and skips the
          // queued retries below, whose results could not be checked.
          queueStats = await runValidatedCheck(step, checkContext);
        } else {
          // Scheduled checks use DataForSEO's task queue (~30% of live cost);
          // manual checks stay on the live endpoint for instant results.
          // Retries always go through the queue.
          if (trigger === "scheduled") {
            await runQueuedCheck(step, checkContext);
          } else {
            await runLiveCheck(step, checkContext);
          }
          await retryRankChecks(step, checkContext, configId, trigger);
        }
      } catch (error) {
        // Batch failure — snapshots for completed batches are already
        // persisted incrementally. Continue to finalization.
        batchError = error instanceof Error ? error.message : String(error);
        console.warn(`[rank-check] ${runId} partial failure: ${batchError}`);
      }

      await pgStep(step, "finalize", FREE_STEP_CONFIG, async () =>
        finalizeRankCheckRun({
          runId,
          configId,
          projectId,
          billingCustomer,
          trigger,
          devices,
          batchError,
          queueStats,
        }),
      );
    } catch (error) {
      console.error(
        `Rank check ${runId} failed: ${describeError(error)}`,
        error,
      );
      // A retry after the body finished (an engine storage failure) sends the
      // failed event again; harmless.
      await pgStep(step, "mark-failed", FREE_STEP_CONFIG, async () =>
        markRankCheckRunFailed({
          runId,
          configId,
          projectId,
          billingCustomer,
          error,
        }),
      );
      throw error;
    }
  }
}
