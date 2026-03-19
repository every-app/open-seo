import { createServerFn } from "@tanstack/react-start";
import { PsiAuditService } from "@/server/features/psi/services/PsiAuditService";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  psiAuditIssueSchema,
  psiAuditExportSchema,
  psiProjectKeySchema,
  psiProjectSchema,
} from "@/types/schemas/psi";

export const getProjectPsiApiKey = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => psiProjectSchema.parse(data))
  .handler(async ({ context }) => {
    return PsiAuditService.getProjectPsiApiKey({
      projectId: context.project.id,
    });
  });

export const saveProjectPsiApiKey = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => psiProjectKeySchema.parse(data))
  .handler(async ({ data, context }) => {
    return PsiAuditService.saveProjectPsiApiKey({
      projectId: context.project.id,
      apiKey: data.apiKey,
    });
  });

export const clearProjectPsiApiKey = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => psiProjectSchema.parse(data))
  .handler(async ({ context }) => {
    return PsiAuditService.clearProjectPsiApiKey({
      projectId: context.project.id,
    });
  });

export const getAuditPsiIssues = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => psiAuditIssueSchema.parse(data))
  .handler(async ({ data, context }) => {
    return PsiAuditService.getAuditPsiIssues({
      projectId: context.project.id,
      resultId: data.resultId,
      category: data.category,
    });
  });

export const exportAuditPsi = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => psiAuditExportSchema.parse(data))
  .handler(async ({ data, context }) => {
    return PsiAuditService.exportAuditPsi({
      projectId: context.project.id,
      resultId: data.resultId,
      mode: data.mode,
      category: data.category,
    });
  });
