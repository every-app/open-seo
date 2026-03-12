import { createServerFn } from "@tanstack/react-start";
import { authenticatedServerFunctionMiddleware } from "@/serverFunctions/middleware";
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
  .middleware(authenticatedServerFunctionMiddleware)
  .inputValidator((data: unknown) => startAuditSchema.parse(data))
  .handler(async ({ data, context }) =>
    AuditService.startAudit({
      userId: context.userId,
      projectId: data.projectId,
      startUrl: data.startUrl,
      maxPages: data.maxPages,
      psiStrategy: data.psiStrategy,
      psiApiKey: data.psiApiKey,
    }),
  );

export const getAuditStatus = createServerFn({ method: "POST" })
  .middleware(authenticatedServerFunctionMiddleware)
  .inputValidator((data: unknown) => getAuditStatusSchema.parse(data))
  .handler(async ({ data, context }) =>
    AuditService.getStatus(data.auditId, context.userId),
  );

export const getAuditResults = createServerFn({ method: "POST" })
  .middleware(authenticatedServerFunctionMiddleware)
  .inputValidator((data: unknown) => getAuditResultsSchema.parse(data))
  .handler(async ({ data, context }) =>
    AuditService.getResults(data.auditId, context.userId),
  );

export const getAuditHistory = createServerFn({ method: "POST" })
  .middleware(authenticatedServerFunctionMiddleware)
  .inputValidator((data: unknown) => getAuditHistorySchema.parse(data))
  .handler(async ({ data, context }) =>
    AuditService.getHistory(data.projectId, context.userId),
  );

export const getCrawlProgress = createServerFn({ method: "POST" })
  .middleware(authenticatedServerFunctionMiddleware)
  .inputValidator((data: unknown) => getCrawlProgressSchema.parse(data))
  .handler(async ({ data, context }) =>
    AuditService.getCrawlProgress(data.auditId, context.userId),
  );

export const deleteAudit = createServerFn({ method: "POST" })
  .middleware(authenticatedServerFunctionMiddleware)
  .inputValidator((data: unknown) => deleteAuditSchema.parse(data))
  .handler(async ({ data, context }) => {
    await AuditService.remove(data.auditId, context.userId);
    return { success: true };
  });
