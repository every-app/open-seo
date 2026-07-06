import { createServerFn } from "@tanstack/react-start";
import { waitUntil } from "cloudflare:workers";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import { RankTrackingService } from "@/server/features/rank-tracking/services/RankTrackingService";
import { getLatestResults } from "@/server/features/rank-tracking/services/rankTrackingResults";
import { AppError, asAppError } from "@/server/lib/errors";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { customerHasPaidPlan } from "@/server/billing/subscription";
import { captureServerEvent } from "@/server/lib/posthog";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  getConfigsSchema,
  createConfigSchema,
  updateConfigSchema,
  triggerCheckSchema,
  getLatestResultsSchema,
  getLatestRunSchema,
  estimateCostSchema,
  addKeywordsSchema,
  removeKeywordsSchema,
  refreshMetricsSchema,
  getKeywordHistorySchema,
  getConfigTrendSchema,
  getPositionMatrixSchema,
} from "@/types/schemas/rank-tracking";

export interface RankKeywordHistoryPoint {
  device: "desktop" | "mobile";
  checkedAt: string;
  position: number | null;
}

interface RankConfigTrendPoint {
  runId: string;
  checkedAt: string;
  top3: number;
  top4to10: number;
  top11to20: number;
  notRanking: number;
}

export interface RankPositionMatrixCell {
  runId: string;
  checkedAt: string;
  trackingKeywordId: string;
  position: number | null;
}

async function requireConfig(configId: string, projectId: string) {
  const config = await RankTrackingRepository.getConfigById({
    configId,
    projectId,
  });
  if (!config) {
    throw new AppError("INTERNAL_ERROR", "Rank tracking config not found");
  }
  return config;
}

export const getRankTrackingConfigs = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getConfigsSchema)
  .handler(async ({ context }) => {
    return RankTrackingRepository.getConfigsForProject(context.projectId);
  });

export const getRankTrackingConfigSummaries = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getConfigsSchema)
  .handler(async ({ context }) => {
    return RankTrackingRepository.getConfigSummaries(context.projectId);
  });

export const createRankTrackingConfig = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(createConfigSchema)
  .handler(async ({ data, context }) => {
    const result = await RankTrackingService.createConfig({
      projectId: context.projectId,
      domain: data.domain,
      locationCode: data.locationCode,
      languageCode: data.languageCode,
      locationName: data.locationName,
      devices: data.devices,
      serpDepth: data.serpDepth,
      scheduleInterval: data.scheduleInterval,
    });

    waitUntil(
      captureServerEvent({
        distinctId: context.userId,
        event: "rank_tracking:config_create",
        organizationId: context.organizationId,
        properties: {
          project_id: context.projectId,
          domain: data.domain,
          devices: data.devices ?? "both",
          schedule: data.scheduleInterval ?? "weekly",
        },
      }),
    );

    return result;
  });

export const updateRankTrackingConfig = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(updateConfigSchema)
  .handler(async ({ data, context }) => {
    await RankTrackingService.updateConfig(data.configId, context.projectId, {
      domain: data.domain,
      locationCode: data.locationCode,
      languageCode: data.languageCode,
      locationName: data.locationName,
      devices: data.devices,
      serpDepth: data.serpDepth,
      scheduleInterval: data.scheduleInterval,
      isActive: data.isActive,
    });
    return { success: true };
  });

export const triggerRankCheck = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(triggerCheckSchema)
  .handler(async ({ data, context }) => {
    const isHosted = await isHostedServerAuthMode();
    if (isHosted && !(await customerHasPaidPlan(context.organizationId))) {
      throw new AppError(
        "PAYMENT_REQUIRED",
        "Upgrade to the paid plan to run rank checks",
      );
    }

    const result = await RankTrackingService.triggerCheck({
      configId: data.configId,
      projectId: context.projectId,
      billingCustomer: context,
      keywordIds: data.keywordIds,
    });

    if (result.ok) {
      waitUntil(
        captureServerEvent({
          distinctId: context.userId,
          event: "rank_tracking:check_trigger",
          organizationId: context.organizationId,
          properties: {
            project_id: context.projectId,
            config_id: data.configId,
            run_id: result.runId,
          },
        }),
      );
    }

    return result;
  });

export const getLatestRankResults = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getLatestResultsSchema)
  .handler(async ({ data, context }) => {
    return getLatestResults(
      data.configId,
      context.projectId,
      data.comparePeriod,
    );
  });

export const getLatestRankRun = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getLatestRunSchema)
  .handler(async ({ data, context }) => {
    return RankTrackingService.getLatestRun(data.configId, context.projectId);
  });

export const estimateRankCheckCost = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(estimateCostSchema)
  .handler(async ({ data, context }) => {
    return RankTrackingService.estimateCost(data.configId, context.projectId);
  });

export const addTrackingKeywords = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(addKeywordsSchema)
  .handler(async ({ data, context }) => {
    const result = await RankTrackingService.addKeywords(
      data.configId,
      context.projectId,
      data.keywords,
    );

    let checkTriggered = false;
    if (result.addedIds.length > 0) {
      const isHosted = await isHostedServerAuthMode();
      const hasPaidPlan =
        !isHosted || (await customerHasPaidPlan(context.organizationId));

      if (hasPaidPlan) {
        try {
          const triggerResult = await RankTrackingService.triggerCheck({
            configId: data.configId,
            projectId: context.projectId,
            billingCustomer: context,
            keywordIds: result.addedIds,
          });
          checkTriggered = triggerResult.ok;
          if (!triggerResult.ok) {
            console.info(
              "[rank-tracking] auto-check skipped: %s",
              triggerResult.reason,
            );
          }
        } catch (err) {
          const appErr = asAppError(err);
          if (appErr?.code === "INSUFFICIENT_CREDITS") {
            console.info(
              "[rank-tracking] auto-check skipped: insufficient credits",
            );
          } else {
            console.error(
              "[rank-tracking] auto-check after keyword add failed:",
              err,
            );
          }
        }
      }
    }

    // Fetch keyword metrics (awaited so they're in the DB before client re-fetches)
    if (result.added > 0) {
      try {
        await RankTrackingService.refreshKeywordMetrics(
          data.configId,
          context.projectId,
          context,
        );
      } catch (err) {
        const appErr = asAppError(err);
        if (appErr?.code === "INSUFFICIENT_CREDITS") {
          console.info(
            "[rank-tracking] auto-metrics-refresh skipped: insufficient credits",
          );
        } else {
          console.error("[rank-tracking] auto-metrics-refresh failed:", err);
        }
      }
    }

    return { ...result, checkTriggered };
  });

export const removeTrackingKeywords = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(removeKeywordsSchema)
  .handler(async ({ data, context }) => {
    await RankTrackingService.removeKeywords(
      data.configId,
      context.projectId,
      data.keywordIds,
    );
    return { removed: data.keywordIds.length };
  });

export const refreshTrackingKeywordMetrics = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(refreshMetricsSchema)
  .handler(async ({ data, context }) => {
    const result = await RankTrackingService.refreshKeywordMetrics(
      data.configId,
      context.projectId,
      context,
    );

    waitUntil(
      captureServerEvent({
        distinctId: context.userId,
        event: "rank_tracking:metrics_refresh",
        organizationId: context.organizationId,
        properties: {
          project_id: context.projectId,
          config_id: data.configId,
          updated: result.updated,
        },
      }),
    );

    return result;
  });

export const getRankKeywordHistory = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getKeywordHistorySchema)
  .handler(async ({ data, context }): Promise<RankKeywordHistoryPoint[]> => {
    await requireConfig(data.configId, context.projectId);
    return RankTrackingRepository.getKeywordHistory(
      data.configId,
      data.trackingKeywordId,
      data.sinceDays,
    );
  });

export const getRankConfigTrend = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getConfigTrendSchema)
  .handler(async ({ data, context }): Promise<RankConfigTrendPoint[]> => {
    await requireConfig(data.configId, context.projectId);
    const rows = await RankTrackingRepository.getConfigTrend(
      data.configId,
      data.device,
      data.sinceDays,
    );
    // SQLite sum()/count() can return strings; coerce and derive "not ranking"
    // (position > 20 or null) as the remainder so the buckets cover every kw.
    return rows.map((row) => {
      const top3 = Number(row.top3) || 0;
      const top4to10 = Number(row.top4to10) || 0;
      const top11to20 = Number(row.top11to20) || 0;
      const total = Number(row.total) || 0;
      return {
        runId: row.runId,
        checkedAt: row.checkedAt,
        top3,
        top4to10,
        top11to20,
        notRanking: Math.max(0, total - top3 - top4to10 - top11to20),
      };
    });
  });

export const getRankPositionMatrix = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getPositionMatrixSchema)
  .handler(async ({ data, context }): Promise<RankPositionMatrixCell[]> => {
    await requireConfig(data.configId, context.projectId);
    return RankTrackingRepository.getPositionMatrix(
      data.configId,
      data.device,
      data.runLimit,
    );
  });
