import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { RapidapiService } from "@/server/features/revenue/services/RapidapiService";
import { requireProjectContext } from "@/serverFunctions/middleware";

const projectScopedSchema = z.object({ projectId: z.string().min(1) });
const logSnapshotSchema = projectScopedSchema.extend({
  capturedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  activeSubscribers: z.number().int().min(0).max(1_000_000),
  payingSubscribers: z.number().int().min(0).max(1_000_000).nullable(),
});
const deleteSnapshotSchema = projectScopedSchema.extend({
  id: z.string().min(1),
});

export const getRapidapiSnapshots = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    return RapidapiService.listSnapshots(context.projectId);
  });

export const logRapidapiSnapshot = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(logSnapshotSchema)
  .handler(async ({ data, context }) => {
    const snapshot = await RapidapiService.logSnapshot({
      projectId: context.projectId,
      organizationId: context.organizationId,
      capturedOn: data.capturedOn,
      activeSubscribers: data.activeSubscribers,
      payingSubscribers: data.payingSubscribers,
      userId: context.userId,
    });
    return { snapshot };
  });

export const deleteRapidapiSnapshot = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(deleteSnapshotSchema)
  .handler(async ({ data, context }) => {
    await RapidapiService.deleteSnapshot({
      projectId: context.projectId,
      id: data.id,
    });
    return { deleted: true as const };
  });
