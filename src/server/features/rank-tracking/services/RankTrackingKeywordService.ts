import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import { AppError } from "@/server/lib/errors";
import {
  devicesCount,
  estimateRankCheckCredits,
  estimateScheduledRankCheckCredits,
  isScheduledRankTrackingInterval,
  MAX_KEYWORDS_PER_CONFIG,
} from "@/shared/rank-tracking";

async function addKeywords(
  configId: string,
  projectId: string,
  keywords: string[],
  approval:
    | { kind: "direct_user_action" }
    | {
        kind: "credit_ceiling";
        maxEstimatedScheduledCheckCredits?: number;
      },
) {
  const config = await getValidatedConfig(configId, projectId);
  const existing = await RankTrackingRepository.getKeywordsForConfig(configId);

  if (existing.length >= MAX_KEYWORDS_PER_CONFIG) {
    throw new AppError(
      "INTERNAL_ERROR",
      `Maximum ${MAX_KEYWORDS_PER_CONFIG} keywords per domain. Currently tracking ${existing.length}.`,
    );
  }

  const existingKeywords = new Set(existing.map((kw) => kw.keyword));
  const available = MAX_KEYWORDS_PER_CONFIG - existing.length;
  const seen = new Set<string>();
  const rows: Array<{ id: string; configId: string; keyword: string }> = [];

  for (const raw of keywords) {
    if (rows.length >= available) break;
    const normalized = raw.trim().toLowerCase();
    if (
      normalized &&
      !seen.has(normalized) &&
      !existingKeywords.has(normalized)
    ) {
      seen.add(normalized);
      rows.push({ id: crypto.randomUUID(), configId, keyword: normalized });
    }
  }

  const scheduleInterval = isScheduledRankTrackingInterval(
    config.scheduleInterval,
  )
    ? config.scheduleInterval
    : null;
  let scheduledEstimate:
    | ReturnType<typeof estimateScheduledRankCheckCredits>
    | undefined;
  if (rows.length > 0 && scheduleInterval) {
    scheduledEstimate = estimateScheduledRankCheckCredits(
      existing.length + rows.length,
      config.devices,
      config.serpDepth,
      scheduleInterval,
    );
    if (
      approval.kind === "credit_ceiling" &&
      (approval.maxEstimatedScheduledCheckCredits == null ||
        scheduledEstimate.costCredits >
          approval.maxEstimatedScheduledCheckCredits)
    ) {
      throw scheduledApprovalError(scheduleInterval, scheduledEstimate);
    }
  }

  const addedIds =
    rows.length > 0
      ? await RankTrackingRepository.addKeywordsToConfig(rows)
      : [];

  if (
    scheduledEstimate &&
    scheduleInterval &&
    addedIds.length > 0 &&
    approval.kind === "credit_ceiling"
  ) {
    const persistedKeywordCount =
      await RankTrackingRepository.getKeywordCountForConfig(configId);
    scheduledEstimate = estimateScheduledRankCheckCredits(
      persistedKeywordCount,
      config.devices,
      config.serpDepth,
      scheduleInterval,
    );
    if (
      approval.maxEstimatedScheduledCheckCredits == null ||
      scheduledEstimate.costCredits > approval.maxEstimatedScheduledCheckCredits
    ) {
      await RankTrackingRepository.removeKeywordsFromConfig(addedIds, configId);
      throw scheduledApprovalError(scheduleInterval, scheduledEstimate);
    }
  }

  return { added: addedIds.length, addedIds, scheduledEstimate };
}

async function removeKeywords(
  configId: string,
  projectId: string,
  keywordIds: string[],
) {
  await getValidatedConfig(configId, projectId);
  const uniqueIds = [...new Set(keywordIds)];
  const removedIds = await RankTrackingRepository.removeKeywordsFromConfig(
    uniqueIds,
    configId,
  );
  return { removed: removedIds.length, removedIds };
}

async function estimateCost(
  configId: string,
  projectId: string,
  additionalKeywordCount = 0,
) {
  const config = await getValidatedConfig(configId, projectId);
  const existingKeywordCount =
    await RankTrackingRepository.getKeywordCountForConfig(configId);
  const keywordCount = Math.max(
    existingKeywordCount,
    Math.min(
      MAX_KEYWORDS_PER_CONFIG,
      existingKeywordCount + additionalKeywordCount,
    ),
  );
  const { costUsd, costCredits } = estimateRankCheckCredits(
    keywordCount,
    config.devices,
    config.serpDepth,
    "live",
  );
  const scheduleInterval = isScheduledRankTrackingInterval(
    config.scheduleInterval,
  )
    ? config.scheduleInterval
    : null;
  return {
    costUsd,
    costCredits,
    keywordCount,
    devicesCount: devicesCount(config.devices),
    totalChecks: keywordCount * devicesCount(config.devices),
    method: "live" as const,
    existingKeywordCount,
    additionalKeywordCount: keywordCount - existingKeywordCount,
    scheduledEstimate: scheduleInterval
      ? estimateScheduledRankCheckCredits(
          keywordCount,
          config.devices,
          config.serpDepth,
          scheduleInterval,
        )
      : undefined,
  };
}

async function getValidatedConfig(configId: string, projectId: string) {
  const config = await RankTrackingRepository.getConfigById({
    configId,
    projectId,
  });
  if (!config) {
    throw new AppError("NOT_FOUND", "Rank tracking config not found");
  }
  return config;
}

function scheduledApprovalError(
  scheduleInterval: "daily" | "weekly" | "monthly",
  estimate: ReturnType<typeof estimateScheduledRankCheckCredits>,
) {
  return new AppError(
    "VALIDATION_ERROR",
    `Adding these keywords would make each ${scheduleInterval} scheduled check cost a nominal queued estimate of ${estimate.costCredits} credits (~$${estimate.costUsd.toFixed(4)} per check; ~${estimate.monthlyCostCredits} credits/month). Call estimate_rank_tracker_cost with additionalKeywordCount, show the recurring estimate and live-fallback caveat to the user, then retry with maxEstimatedScheduledCheckCredits set to the approved per-check estimate. Live fallback for rejected, failed, or timed-out queued tasks may use additional separately billed credits.`,
  );
}

export const RankTrackingKeywordService = {
  addKeywords,
  removeKeywords,
  estimateCost,
};
