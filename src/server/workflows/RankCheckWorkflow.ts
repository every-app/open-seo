import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import {
  failRunAndReleaseRankCheckLock,
  releaseRankCheckRunLock,
  runOwnsRankCheckLock,
} from "@/server/features/rank-tracking/services/rankCheckRunGuards";
import { runLiveCheck } from "@/server/workflows/rankCheckPaths";
import { createDataforseoClient } from "@/server/lib/dataforseoClient";
import { captureServerEvent } from "@/server/lib/posthog";
import { AppError } from "@/server/lib/errors";
import { autumn } from "@/server/billing/autumn";
import {
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
} from "@/shared/billing";
import { estimateRankCheckCredits } from "@/shared/rank-tracking";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";

const SINGLE_ATTEMPT_STEP_CONFIG = {
  retries: { limit: 0, delay: "1 second" as const },
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
  devices: "both" | "desktop" | "mobile";
  trigger: "manual" | "scheduled";
  keywordIds?: string[];
}

async function prepareRankCheckKeywords(input: {
  runId: string;
  configId: string;
  billingCustomer: BillingCustomerContext;
  devices: RankCheckParams["devices"];
  keywordIds?: string[];
}) {
  const ownsLock = await runOwnsRankCheckLock(input.configId, input.runId);
  if (!ownsLock) {
    throw new NonRetryableError(
      `Rank check lock is not held by run ${input.runId}`,
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

  if (trackingKeywords.length === 0) {
    throw new AppError("INTERNAL_ERROR", "No keywords to track");
  }

  // Verify the user has enough credits for the full check before starting
  if (await isHostedServerAuthMode()) {
    const { costCredits } = estimateRankCheckCredits(
      trackingKeywords.length,
      input.devices,
    );
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
      throw new AppError(
        "INSUFFICIENT_CREDITS",
        "Insufficient credits for rank check",
      );
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

async function finalizeRankCheckRun(input: {
  runId: string;
  configId: string;
  projectId: string;
  billingCustomer: BillingCustomerContext;
  trigger: RankCheckParams["trigger"];
  batchError: string | null;
}) {
  // Re-check lock ownership before finalizing. If the lock was stolen
  // (stale cleanup raced with a slow workflow), bail out to avoid
  // overwriting the replacement run's state.
  const ownsLock = await runOwnsRankCheckLock(input.configId, input.runId);
  if (!ownsLock) {
    console.warn(
      `[rank-check] ${input.runId} lost lock ownership, skipping finalization`,
    );
    return;
  }

  const nowIso = new Date().toISOString();

  // Snapshots were written incrementally by each batch step.
  // Count from DB to get the authoritative keyword count.
  const snapshots = await RankTrackingRepository.getSnapshotsForRun(
    input.runId,
  );
  const keywordsChecked = new Set(snapshots.map((s) => s.trackingKeywordId))
    .size;

  // Derive incompleteCount from the run's keywordsTotal (set in prepare step)
  const run = await RankTrackingRepository.getRunById(input.runId);
  const keywordsTotal = run?.keywordsTotal ?? keywordsChecked;
  const incompleteCount = keywordsTotal - keywordsChecked;

  let errorMessage: string | undefined;
  if (input.batchError) {
    errorMessage = `Completed ${keywordsChecked} of ${keywordsTotal} keyword(s). Error: ${input.batchError}`;
  } else if (incompleteCount > 0) {
    errorMessage = `${incompleteCount} keyword(s) could not be checked`;
  }

  await RankTrackingRepository.updateRun(input.runId, {
    status: "completed",
    keywordsChecked,
    completedAt: nowIso,
    ...(errorMessage ? { errorMessage } : {}),
  });

  // Clear any previous skip reason on success.
  // Note: nextCheckAt is NOT set here — the cron handler advances it eagerly
  // before starting the workflow to prevent retry storms.
  await RankTrackingRepository.updateConfig(input.configId, input.projectId, {
    lastCheckedAt: nowIso,
    lastSkipReason: null,
  });

  await releaseRankCheckRunLock(input.configId, input.runId);

  await captureServerEvent({
    distinctId: input.billingCustomer.userId,
    event: "rank_tracking:check_complete",
    organizationId: input.billingCustomer.organizationId,
    properties: {
      project_id: input.projectId,
      status: "completed",
      trigger: input.trigger,
      keywords_checked: keywordsChecked,
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
  const errorMessage =
    input.error instanceof Error ? input.error.message : "Unknown error";
  await failRunAndReleaseRankCheckLock(
    input.configId,
    input.runId,
    errorMessage,
  );

  // Flag the config so the UI can show why the scheduled check was skipped
  const isInsufficientCredits =
    input.error instanceof AppError &&
    input.error.code === "INSUFFICIENT_CREDITS";
  if (isInsufficientCredits) {
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
      error: errorMessage,
    },
  });
}

export class RankCheckWorkflow extends WorkflowEntrypoint<
  Env,
  RankCheckParams
> {
  async run(event: WorkflowEvent<RankCheckParams>, step: WorkflowStep) {
    const {
      runId,
      configId,
      billingCustomer,
      projectId,
      domain,
      locationCode,
      languageCode,
      devices,
      trigger,
      keywordIds,
    } = event.payload;

    const client = createDataforseoClient(billingCustomer);

    try {
      console.log(
        `[rank-check] ${runId} starting (trigger=${trigger}, devices=${devices})`,
      );

      const prepareResult = await step.do(
        "prepare",
        { retries: { limit: 0, delay: "1 second" } },
        async () =>
          prepareRankCheckKeywords({
            runId,
            configId,
            billingCustomer,
            devices,
            keywordIds,
          }),
      );

      const keywords = prepareResult.keywords;

      console.log(`[rank-check] ${runId} loaded ${keywords.length} keywords`);

      let batchError: string | null = null;

      try {
        await runLiveCheck(step, {
          client,
          keywords,
          devices,
          domain,
          locationCode,
          languageCode,
          runId,
        });
      } catch (error) {
        // Batch failure — snapshots for completed batches are already
        // persisted incrementally. Continue to finalization.
        batchError = error instanceof Error ? error.message : String(error);
        console.warn(`[rank-check] ${runId} partial failure: ${batchError}`);
      }

      await step.do("finalize", SINGLE_ATTEMPT_STEP_CONFIG, async () =>
        finalizeRankCheckRun({
          runId,
          configId,
          projectId,
          billingCustomer,
          trigger,
          batchError,
        }),
      );
    } catch (error) {
      console.error(`Rank check ${runId} failed:`, error);
      await step.do("mark-failed", SINGLE_ATTEMPT_STEP_CONFIG, async () =>
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
