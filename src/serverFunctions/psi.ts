import { createServerFn } from "@tanstack/react-start";
import { PsiAuditService } from "@/server/features/psi/services/PsiAuditService";
import { authenticatedServerFunctionMiddleware } from "@/serverFunctions/middleware";
import {
  psiUnifiedIssueSchema,
  psiUnifiedExportSchema,
  psiProjectKeySchema,
  psiProjectSchema,
} from "@/types/schemas/psi";

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
