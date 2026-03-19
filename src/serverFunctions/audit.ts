import { createServerFn } from "@tanstack/react-start";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  startAuditSchema,
  getAuditStatusSchema,
  getAuditResultsSchema,
  getAuditHistorySchema,
  deleteAuditSchema,
  getCrawlProgressSchema,
} from "@/types/schemas/audit";
import { AuditService } from "@/server/features/audit/services/AuditService";

export const startAudit = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => startAuditSchema.parse(data))
  .handler(async ({ data, context }) => {
    return AuditService.startAudit({
      actorUserId: context.userId,
      projectId: context.project.id,
      startUrl: data.startUrl,
      maxPages: data.maxPages,
      psiStrategy: data.psiStrategy,
      psiApiKey: data.psiApiKey,
    });
  });

export const getAuditStatus = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => getAuditStatusSchema.parse(data))
  .handler(async ({ data, context }) => {
    return AuditService.getStatus(data.auditId, context.project.id);
  });

export const getAuditResults = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => getAuditResultsSchema.parse(data))
  .handler(async ({ data, context }) => {
    return AuditService.getResults(data.auditId, context.project.id);
  });

export const getAuditHistory = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => getAuditHistorySchema.parse(data))
  .handler(async ({ context }) => {
    return AuditService.getHistory(context.project.id);
  });

export const getCrawlProgress = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => getCrawlProgressSchema.parse(data))
  .handler(async ({ data, context }) => {
    return AuditService.getCrawlProgress(data.auditId, context.project.id);
  });

export const deleteAudit = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => deleteAuditSchema.parse(data))
  .handler(async ({ data, context }) => {
    await AuditService.remove(data.auditId, context.project.id);
    return { success: true };
  });
