import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import { withPgClient } from "@/db";
import { yieldingStep } from "@/server/workflows/yieldingStep";
import {
  getUsageCreditsRemaining,
  type BillingCustomerContext,
} from "@/server/billing/subscription";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import { failRunIfActive } from "@/server/features/rank-tracking/services/rankCheckRunGuards";
import { runQueuedCheck } from "@/server/workflows/rankCheckPaths";
import {
  READ_WINDOW_MS,
  retryRankChecks,
} from "@/server/workflows/rankCheckRetries";
import { resolveRunGotoUrls } from "@/server/workflows/rankCheckGotoUrls";
import { pgStep } from "@/server/workflows/pgStep";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { captureServerEvent } from "@/server/lib/posthog";
import { sendCreditsExhaustedEvent } from "@/server/email/onboarding-drip";
import { describeError } from "@/server/lib/errors";
import {
  estimateRankCheckCredits,
  rankCheckCostApprovalError,
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
  keywordIds?: string[];
  maxCostCredits?: number;
}

async function prepareRankCheckKeywords(input: {
  runId: string;
  configId: string;
  billingCustomer: BillingCustomerContext;
  devices: RankCheckParams["devices"];
  serpDepth: number;
  trigger: RankCheckParams["trigger"];
  keywordIds?: string[];
  maxCostCredits?: number;
}) {
  // If stale-cleanup marked our run failed before we got here, bail out
  // rather than resurrecting a superseded run.
  const started = await RankTrackingRepository.updateRun(input.runId, {
    status: "running",
  });
  if (!started) {
    throw new NonRetryableError(`Run ${input.runId} is no longer active`);
  }

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
  );
  if (input.maxCostCredits != null && costCredits > input.maxCostCredits) {
    throw new NonRetryableError(
      rankCheckCostApprovalError(costCredits, input.maxCostCredits),
    );
  }

  // Verify the user has enough credits for the full check before starting.
  // The estimate is the worst case, so it covers every read.
  // A timed-out Autumn read throws here instead of reading as 0 credits, so
  // the step retries it rather than refusing a customer who has credits.
  if (await isHostedServerAuthMode()) {
    const credits = await getUsageCreditsRemaining(
      input.billingCustomer.organizationId,
    );
    const available = credits.monthlyRemaining + credits.topupRemaining;
    if (available < costCredits) {
      // A spent auto-reload budget is not running out: the credits are there,
      // only held back.
      if (!credits.topupBudgetReached) {
        await sendCreditsExhaustedEvent(input.billingCustomer);
      }
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
    readsEndAt: Date.now() + READ_WINDOW_MS,
  };
}

async function finalizeRankCheckRun(input: {
  runId: string;
  configId: string;
  projectId: string;
  billingCustomer: BillingCustomerContext;
  trigger: RankCheckParams["trigger"];
  devices: RankCheckParams["devices"];
  keywords: Array<{ id: string; keyword: string }>;
  batchError: string | null;
}) {
  // If stale-cleanup already marked our run failed, don't overwrite that
  // decision with a completed status — a replacement run may already be
  // underway.
  const run = await RankTrackingRepository.getRunById(input.runId);
  const nowIso = new Date().toISOString();
  const markConfigChecked = () =>
    RankTrackingRepository.updateConfig(input.configId, input.projectId, {
      lastCheckedAt: nowIso,
      lastSkipReason: null,
    });
  // Only this workflow completes its run, so "completed" here means an earlier
  // attempt of this step got that far and then failed: finish its config write.
  if (run?.status === "completed") {
    await markConfigChecked();
    return;
  }
  if (!run || run.status === "failed") {
    console.warn(
      `[rank-check] ${input.runId} no longer active (status=${run?.status ?? "missing"}), skipping finalization`,
    );
    return;
  }

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

  const status =
    keywordsChecked === 0 && keywordsTotal > 0 ? "failed" : "completed";
  const checkedSummary =
    checkedByDevice.length > 1
      ? checkedByDevice
          .map(({ device, count }) => `${count} of ${keywordsTotal} ${device}`)
          .join(" and ")
      : `${keywordsChecked} of ${keywordsTotal}`;
  const errorMessage =
    status === "failed"
      ? (input.batchError ?? "No keywords could be checked.")
      : isPartial
        ? [
            `Checked ${checkedSummary} keyword(s).`,
            describeUnchecked(input.keywords, devices, snapshots),
          ]
            .filter(Boolean)
            .join(" ")
        : null;

  // Flipping status away from 'pending'/'running' is what releases the
  // partial-index slot for the next run. Stale-cleanup can still fail the run
  // between the read above and this write; its decision stands.
  const finalized = await RankTrackingRepository.updateRun(input.runId, {
    status,
    keywordsChecked,
    completedAt: nowIso,
    errorMessage,
  });
  if (!finalized) return;

  // Clear any previous skip reason on success. A failed run must not advance
  // lastCheckedAt — nothing was actually checked.
  // Note: nextCheckAt is NOT set here — the cron handler advances it eagerly
  // before starting the workflow to prevent retry storms.
  if (status === "completed") await markConfigChecked();

  // One-line summary per run, visible in Workers Logs.
  // Error text can echo vendor/user content — keep it one line and bounded.
  const errorSummary = errorMessage
    ? ` error="${errorMessage.replace(/\s+/g, " ").slice(0, 200)}"`
    : "";
  console.log(
    `[rank-check] ${input.runId} ${status} org=${input.billingCustomer.organizationId} project=${input.projectId} trigger=${input.trigger} keywords=${keywordsChecked}/${keywordsTotal}${errorSummary}`,
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
    },
  });
}

/** Names a partial run's unchecked keywords, so users see which ones failed. */
function describeUnchecked(
  keywords: Array<{ id: string; keyword: string }>,
  devices: Array<"desktop" | "mobile">,
  snapshots: Array<{ trackingKeywordId: string; device: string }>,
) {
  const checked = new Set(
    snapshots.map((s) => `${s.trackingKeywordId}:${s.device}`),
  );
  const unchecked = keywords.flatMap((kw) => {
    const missing = devices.filter((d) => !checked.has(`${kw.id}:${d}`));
    if (missing.length === 0) return [];
    // Name the device only when the other one got a result.
    return missing.length < devices.length
      ? [`"${kw.keyword}" (${missing[0]})`]
      : [`"${kw.keyword}"`];
  });
  if (unchecked.length === 0) return "";
  const shown = unchecked.slice(0, UNCHECKED_KEYWORDS_SHOWN).join(", ");
  const more = unchecked.length - UNCHECKED_KEYWORDS_SHOWN;
  return `Not checked: ${shown}${more > 0 ? ` and ${more} more` : ""}.`;
}

/** Keeps a partial run's message readable on a large tracker. */
const UNCHECKED_KEYWORDS_SHOWN = 10;

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
    return withPgClient(() => this.runScoped(event, yieldingStep(step)));
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
      keywordIds,
      maxCostCredits,
    } = event.payload;

    try {
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

      console.log(
        `[rank-check] ${runId} starting (trigger=${trigger}, devices=${devices})`,
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
            trigger,
            keywordIds,
            maxCostCredits,
          }),
      );

      const keywords = prepareResult.keywords;
      const client = createDataforseoClient(billingCustomer);

      console.log(`[rank-check] ${runId} loaded ${keywords.length} keywords`);

      let batchError: string | null = null;

      try {
        const checkContext = {
          client,
          keywords,
          devices,
          serpDepth,
          domain,
          locationCode,
          languageCode,
          locationName,
          runId,
        };
        await runQueuedCheck(step, checkContext);
        await retryRankChecks(
          step,
          checkContext,
          configId,
          prepareResult.readsEndAt,
        );
      } catch (error) {
        // Batch failure — snapshots for completed batches are already
        // persisted incrementally. Continue to finalization.
        batchError = error instanceof Error ? error.message : String(error);
        console.warn(`[rank-check] ${runId} partial failure: ${batchError}`);
      }

      try {
        await pgStep(step, "resolve-goto-urls", FREE_STEP_CONFIG, () =>
          resolveRunGotoUrls(runId),
        );
      } catch (error) {
        // The positions are saved and the goto links still work, so this
        // doesn't fail the run.
        console.warn(
          `[rank-check] ${runId} goto URLs not resolved: ${describeError(error)}`,
        );
      }

      await pgStep(step, "finalize", FREE_STEP_CONFIG, async () =>
        finalizeRankCheckRun({
          runId,
          configId,
          projectId,
          billingCustomer,
          trigger,
          devices,
          keywords,
          batchError,
        }),
      );
    } catch (error) {
      // Cloudflare resets the Workflow's Durable Object on a deploy or its own
      // restarts. The engine replays the run from its last finished step and
      // it completes normally, so this is a warning, not a failure.
      if (
        error instanceof Error &&
        error.message.includes("Durable Object reset because its code")
      ) {
        console.warn(`Rank check ${runId} interrupted: ${error.message}`);
      } else {
        console.error(
          `Rank check ${runId} failed: ${describeError(error)}`,
          error,
        );
      }
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
