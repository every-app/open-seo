import { createServerFn } from "@tanstack/react-start";
import { PsiAuditService } from "@/server/features/psi/services/PsiAuditService";
import { authenticatedServerFunctionMiddleware } from "@/serverFunctions/middleware";
import {
  psiAuditSchema,
  psiAuditListSchema,
  psiAuditDetailsSchema,
  psiIssueFilterSchema,
  psiExportSchema,
  psiUnifiedIssueSchema,
  psiUnifiedExportSchema,
  psiProjectKeySchema,
  psiProjectSchema,
} from "@/types/schemas/psi";

export const runPsiAudit = createServerFn({ method: "POST" })
  .middleware(authenticatedServerFunctionMiddleware)
  .inputValidator((data: unknown) => psiAuditSchema.parse(data))
  .handler(async ({ data, context }) =>
    PsiAuditService.runAudit({
      projectId: data.projectId,
      userId: context.userId,
      url: data.url,
      strategy: data.strategy,
    }),
  );

export const getProjectPsiApiKey = createServerFn({ method: "POST" })
  .middleware(authenticatedServerFunctionMiddleware)
  .inputValidator((data: unknown) => psiProjectSchema.parse(data))
  .handler(async ({ data, context }) =>
    PsiAuditService.getProjectPsiApiKey({
      projectId: data.projectId,
      userId: context.userId,
    }),
  );

export const saveProjectPsiApiKey = createServerFn({ method: "POST" })
  .middleware(authenticatedServerFunctionMiddleware)
  .inputValidator((data: unknown) => psiProjectKeySchema.parse(data))
  .handler(async ({ data, context }) =>
    PsiAuditService.saveProjectPsiApiKey({
      projectId: data.projectId,
      userId: context.userId,
      apiKey: data.apiKey,
    }),
  );

export const clearProjectPsiApiKey = createServerFn({ method: "POST" })
  .middleware(authenticatedServerFunctionMiddleware)
  .inputValidator((data: unknown) => psiProjectSchema.parse(data))
  .handler(async ({ data, context }) =>
    PsiAuditService.clearProjectPsiApiKey({
      projectId: data.projectId,
      userId: context.userId,
    }),
  );

export const listProjectPsiAudits = createServerFn({ method: "POST" })
  .middleware(authenticatedServerFunctionMiddleware)
  .inputValidator((data: unknown) => psiAuditListSchema.parse(data))
  .handler(async ({ data, context }) =>
    PsiAuditService.listProjectPsiAudits({
      projectId: data.projectId,
      userId: context.userId,
      strategy: data.strategy,
      limit: data.limit,
    }),
  );

export const getProjectPsiAuditRaw = createServerFn({ method: "POST" })
  .middleware(authenticatedServerFunctionMiddleware)
  .inputValidator((data: unknown) => psiAuditDetailsSchema.parse(data))
  .handler(async ({ data, context }) =>
    PsiAuditService.getProjectPsiAuditRaw({
      projectId: data.projectId,
      userId: context.userId,
      auditId: data.auditId,
    }),
  );

export const getProjectPsiAuditIssues = createServerFn({ method: "POST" })
  .middleware(authenticatedServerFunctionMiddleware)
  .inputValidator((data: unknown) => psiIssueFilterSchema.parse(data))
  .handler(async ({ data, context }) =>
    PsiAuditService.getProjectPsiAuditIssues({
      projectId: data.projectId,
      userId: context.userId,
      auditId: data.auditId,
      category: data.category,
    }),
  );

export const exportProjectPsiAudit = createServerFn({ method: "POST" })
  .middleware(authenticatedServerFunctionMiddleware)
  .inputValidator((data: unknown) => psiExportSchema.parse(data))
  .handler(async ({ data, context }) =>
    PsiAuditService.exportProjectPsiAudit({
      projectId: data.projectId,
      userId: context.userId,
      auditId: data.auditId,
      mode: data.mode,
      category: data.category,
    }),
  );

export const getPsiIssuesBySource = createServerFn({ method: "POST" })
  .middleware(authenticatedServerFunctionMiddleware)
  .inputValidator((data: unknown) => psiUnifiedIssueSchema.parse(data))
  .handler(async ({ data, context }) =>
    PsiAuditService.getPsiIssuesBySource({
      projectId: data.projectId,
      userId: context.userId,
      source: data.source,
      resultId: data.resultId,
      category: data.category,
    }),
  );

export const exportPsiBySource = createServerFn({ method: "POST" })
  .middleware(authenticatedServerFunctionMiddleware)
  .inputValidator((data: unknown) => psiUnifiedExportSchema.parse(data))
  .handler(async ({ data, context }) =>
    PsiAuditService.exportPsiBySource({
      projectId: data.projectId,
      userId: context.userId,
      source: data.source,
      resultId: data.resultId,
      mode: data.mode,
      category: data.category,
    }),
  );
