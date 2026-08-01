import { createServerFn } from "@tanstack/react-start";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { GeoGridService } from "@/server/features/geo-grid/services/GeoGridService";
import { GeoGridRepository } from "@/server/features/geo-grid/repositories/GeoGridRepository";
import { z } from "zod";
import { waitUntil } from "cloudflare:workers";
import { AppError } from "@/server/lib/errors";

const projectScopedSchema = z.object({ projectId: z.string().min(1) });

export const getGeoGridConfigs = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    return GeoGridRepository.getConfigsForProject(context.projectId);
  });

export const createGeoGridConfig = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(
    z.object({
      projectId: z.string().min(1),
      businessName: z.string().min(1, "Business name is required"),
      latitude: z.number(),
      longitude: z.number(),
      gridSize: z.number().int().min(3).max(7),
      gridSpacing: z.number().positive(),
      languageCode: z.string().optional(),
      scheduleInterval: z
        .enum(["daily", "weekly", "monthly", "manual"])
        .optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    return GeoGridService.createConfig({
      projectId: context.projectId,
      businessName: data.businessName,
      latitude: data.latitude,
      longitude: data.longitude,
      gridSize: data.gridSize,
      gridSpacing: data.gridSpacing,
      languageCode: data.languageCode,
      scheduleInterval: data.scheduleInterval,
    });
  });

export const addGeoGridKeywords = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(
    z.object({
      projectId: z.string().min(1),
      configId: z.string().min(1),
      keywords: z.array(z.string().min(1)),
    }),
  )
  .handler(async ({ data, context }) => {
    return GeoGridService.addKeywords(
      data.configId,
      context.projectId,
      data.keywords,
    );
  });

export const removeGeoGridKeywords = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(
    z.object({
      projectId: z.string().min(1),
      configId: z.string().min(1),
      keywordIds: z.array(z.string().min(1)),
    }),
  )
  .handler(async ({ data, context }) => {
    await GeoGridService.removeKeywords(
      data.configId,
      context.projectId,
      data.keywordIds,
    );
    return { success: true };
  });

export const triggerGeoGridCheck = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(
    z.object({
      projectId: z.string().min(1),
      configId: z.string().min(1),
    }),
  )
  .handler(async ({ data, context }) => {
    const res = await GeoGridService.triggerCheck({
      configId: data.configId,
      projectId: context.projectId,
      billingCustomer: {
        userId: context.userId,
        userEmail: context.userEmail,
        organizationId: context.organizationId,
        projectId: context.projectId,
      },
    });
    waitUntil(res.promise);
    return { ok: res.ok, runId: res.runId };
  });

export const getGeoGridLatestResults = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(
    z.object({
      projectId: z.string().min(1),
      configId: z.string().min(1),
    }),
  )
  .handler(async ({ data, context }) => {
    const config = await GeoGridRepository.getConfigById(
      data.configId,
      context.projectId,
    );
    if (!config) {
      throw new AppError("VALIDATION_ERROR", "Geo Grid config not found");
    }

    const [keywords, latestRun, snapshots] = await Promise.all([
      GeoGridRepository.getKeywordsForConfig(data.configId),
      GeoGridRepository.getLatestRunForConfig(data.configId),
      GeoGridRepository.getLatestSnapshotsForConfig(data.configId),
    ]);

    return {
      config,
      keywords,
      latestRun,
      snapshots,
    };
  });

export const getGeoGridRuns = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(
    z.object({
      projectId: z.string().min(1),
      configId: z.string().min(1),
    }),
  )
  .handler(async ({ data, context }) => {
    const config = await GeoGridRepository.getConfigById(
      data.configId,
      context.projectId,
    );
    if (!config) {
      throw new AppError("VALIDATION_ERROR", "Geo Grid config not found");
    }
    return GeoGridRepository.getRunsForConfig(data.configId);
  });
