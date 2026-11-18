import { createServerFn } from "@tanstack/react-start";
import { LocalMapRankRepository } from "@/server/features/local-map-rank/repositories/LocalMapRankRepository";
import { LocalMapRankService } from "@/server/features/local-map-rank/services/LocalMapRankService";
import { AppError } from "@/server/lib/errors";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  createLocalMapCampaignSchema,
  getLocalMapCampaignsSchema,
  getLocalMapRunResultsSchema,
  localMapCampaignIdSchema,
} from "@/types/schemas/local-map-rank";

export const getLocalMapCampaigns = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getLocalMapCampaignsSchema)
  .handler(async ({ context }) =>
    LocalMapRankRepository.getCampaignsForProject(context.projectId),
  );

export const createLocalMapCampaign = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(createLocalMapCampaignSchema)
  .handler(async ({ data, context }) =>
    LocalMapRankService.createCampaign({
      projectId: context.projectId,
      name: data.name,
      centerLatitude: data.centerLatitude,
      centerLongitude: data.centerLongitude,
      gridSize: data.gridSize,
      radiusKm: data.radiusKm,
      targetPlaceId: data.targetPlaceId,
      targetCid: data.targetCid,
      languageCode: data.languageCode,
      device: data.device,
      scheduleInterval: data.scheduleInterval,
      serpDepth: data.serpDepth,
      keywords: data.keywords,
    }),
  );

export const triggerLocalMapScan = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(localMapCampaignIdSchema)
  .handler(async ({ data, context }) =>
    LocalMapRankService.triggerScan({
      campaignId: data.campaignId,
      projectId: context.projectId,
      billingCustomer: {
        userId: context.userId,
        userEmail: context.userEmail,
        organizationId: context.organizationId,
        projectId: context.projectId,
      },
    }),
  );

export const estimateLocalMapScanCostFn = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(localMapCampaignIdSchema)
  .handler(async ({ data, context }) =>
    LocalMapRankService.estimateScanCost(data.campaignId, context.projectId),
  );

export const getLocalMapCampaignDetail = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(localMapCampaignIdSchema)
  .handler(async ({ data, context }) =>
    LocalMapRankService.getCampaignDetail(data.campaignId, context.projectId),
  );

export const getLocalMapRunResults = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getLocalMapRunResultsSchema)
  .handler(async ({ data, context }) => {
    const run = await LocalMapRankRepository.getRunById(data.runId);
    if (!run || run.projectId !== context.projectId) {
      throw new AppError("NOT_FOUND", "Scan run not found");
    }
    return LocalMapRankRepository.getResultsForRun(data.runId);
  });
