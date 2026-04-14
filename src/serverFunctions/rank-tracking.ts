import { createServerFn } from "@tanstack/react-start";
import { waitUntil } from "cloudflare:workers";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import { RankTrackingService } from "@/server/features/rank-tracking/services/RankTrackingService";
import { getLatestResults } from "@/server/features/rank-tracking/services/rankTrackingResults";
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
} from "@/types/schemas/rank-tracking";

export const getRankTrackingConfigs = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => getConfigsSchema.parse(data))
  .handler(async ({ context }) => {
    return RankTrackingRepository.getConfigsForProject(context.projectId);
  });

export const getRankTrackingConfigSummaries = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => getConfigsSchema.parse(data))
  .handler(async ({ context }) => {
    return RankTrackingRepository.getConfigSummaries(context.projectId);
  });

export const createRankTrackingConfig = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => createConfigSchema.parse(data))
  .handler(async ({ data, context }) => {
    const result = await RankTrackingService.createConfig({
      projectId: context.projectId,
      domain: data.domain,
      locationCode: data.locationCode,
      languageCode: data.languageCode,
      devices: data.devices,
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
  .inputValidator((data: unknown) => updateConfigSchema.parse(data))
  .handler(async ({ data, context }) => {
    await RankTrackingService.updateConfig(data.configId, context.projectId, {
      domain: data.domain,
      locationCode: data.locationCode,
      languageCode: data.languageCode,
      devices: data.devices,
      scheduleInterval: data.scheduleInterval,
      isActive: data.isActive,
    });
    return { success: true };
  });

export const triggerRankCheck = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => triggerCheckSchema.parse(data))
  .handler(async ({ data, context }) => {
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
  .inputValidator((data: unknown) => getLatestResultsSchema.parse(data))
  .handler(async ({ data, context }) => {
    return getLatestResults(
      data.configId,
      context.projectId,
      data.comparePeriod,
    );
  });

export const getLatestRankRun = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => getLatestRunSchema.parse(data))
  .handler(async ({ data, context }) => {
    return RankTrackingService.getLatestRun(data.configId, context.projectId);
  });

export const estimateRankCheckCost = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => estimateCostSchema.parse(data))
  .handler(async ({ data, context }) => {
    return RankTrackingService.estimateCost(data.configId, context.projectId);
  });

export const addTrackingKeywords = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => addKeywordsSchema.parse(data))
  .handler(async ({ data, context }) => {
    return RankTrackingService.addKeywords(
      data.configId,
      context.projectId,
      data.keywords,
    );
  });

export const removeTrackingKeywords = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => removeKeywordsSchema.parse(data))
  .handler(async ({ data, context }) => {
    await RankTrackingService.removeKeywords(
      data.configId,
      context.projectId,
      data.keywordIds,
    );
    return { removed: data.keywordIds.length };
  });
