import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { BingAiCitationService } from "@/server/features/bing/services/BingAiCitationService";
import { requireProjectContext } from "@/serverFunctions/middleware";

// Bing's exports are small (daily overview) to a few thousand rows (pages/
// queries over a wide window) — 5MB is generous headroom over that, not a
// tuned limit.
const MAX_CSV_LENGTH = 5_000_000;
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const csvSchema = z.string().min(1).max(MAX_CSV_LENGTH);

const projectScopedSchema = z.object({ projectId: z.string().min(1) });
const uploadOverviewSchema = projectScopedSchema.extend({ csvText: csvSchema });
const uploadSnapshotSchema = projectScopedSchema
  .extend({
    csvText: csvSchema,
    periodStart: dateSchema,
    periodEnd: dateSchema,
  })
  .refine((data) => data.periodStart <= data.periodEnd, {
    message: "periodStart must not be after periodEnd",
    path: ["periodStart"],
  });
const snapshotDetailSchema = projectScopedSchema.extend({
  snapshotId: z.string().min(1).nullable().optional(),
});

export const uploadBingAiOverview = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(uploadOverviewSchema)
  .handler(async ({ data, context }) => {
    return BingAiCitationService.uploadOverview({
      projectId: context.projectId,
      organizationId: context.organizationId,
      uploadedByUserId: context.userId,
      csvText: data.csvText,
    });
  });

export const getBingAiOverview = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    const days = await BingAiCitationService.getOverview(context.projectId);
    return { days };
  });

export const uploadBingAiPages = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(uploadSnapshotSchema)
  .handler(async ({ data, context }) => {
    const snapshot = await BingAiCitationService.uploadPages({
      projectId: context.projectId,
      organizationId: context.organizationId,
      uploadedByUserId: context.userId,
      csvText: data.csvText,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
    });
    return { snapshot };
  });

export const getBingAiPagesDetail = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(snapshotDetailSchema)
  .handler(async ({ data, context }) => {
    return BingAiCitationService.getPagesSnapshotDetail(
      context.projectId,
      data.snapshotId ?? null,
    );
  });

export const uploadBingAiQueries = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(uploadSnapshotSchema)
  .handler(async ({ data, context }) => {
    const snapshot = await BingAiCitationService.uploadQueries({
      projectId: context.projectId,
      organizationId: context.organizationId,
      uploadedByUserId: context.userId,
      csvText: data.csvText,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
    });
    return { snapshot };
  });

export const getBingAiQueriesDetail = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(snapshotDetailSchema)
  .handler(async ({ data, context }) => {
    return BingAiCitationService.getQueriesSnapshotDetail(
      context.projectId,
      data.snapshotId ?? null,
    );
  });
