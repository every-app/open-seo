import { AppError } from "@/server/lib/errors";
import { getJsonFromR2 } from "@/server/lib/r2";
import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import {
  PsiIssuesService,
  type PsiIssueCategory,
} from "@/server/features/psi/services/PsiIssuesService";
import { buildPsiExportFile } from "@/server/features/psi/services/psi-export";

type PsiStrategy = "mobile" | "desktop";
type ExportMode = "full" | "issues" | "category";

type AuditPsiTarget = {
  id: string;
  strategy: PsiStrategy;
  finalUrl: string;
  createdAt: string;
  r2Key: string | null;
};

async function getAuditPsiTarget(input: {
  projectId: string;
  resultId: string;
}): Promise<AuditPsiTarget> {
  const site = await AuditRepository.getPsiResultById({
    psiResultId: input.resultId,
    projectId: input.projectId,
  });

  if (!site) {
    throw new AppError("NOT_FOUND");
  }

  return {
    id: site.psi.id,
    strategy: site.psi.strategy,
    finalUrl: site.page?.url ?? "",
    createdAt: site.audit.startedAt,
    r2Key: site.psi.r2Key,
  };
}

async function getProjectPsiApiKey(input: { projectId: string }) {
  const apiKey = await ProjectRepository.getProjectPsiApiKey(input.projectId);
  return { apiKey };
}

async function saveProjectPsiApiKey(input: {
  projectId: string;
  apiKey: string;
}) {
  await ProjectRepository.setProjectPsiApiKey(
    input.projectId,
    input.apiKey.trim(),
  );
  return { success: true };
}

async function clearProjectPsiApiKey(input: { projectId: string }) {
  await ProjectRepository.clearProjectPsiApiKey(input.projectId);
  return { success: true };
}

async function getAuditPsiIssues(input: {
  projectId: string;
  resultId: string;
  category?: PsiIssueCategory;
}) {
  const target = await getAuditPsiTarget(input);
  if (!target.r2Key) {
    throw new AppError("NOT_FOUND");
  }

  const payloadJson = await getJsonFromR2(target.r2Key);
  const issues = PsiIssuesService.parseIssues(payloadJson, input.category);

  return {
    id: target.id,
    finalUrl: target.finalUrl,
    strategy: target.strategy,
    createdAt: target.createdAt,
    issues,
  };
}

async function exportAuditPsi(input: {
  projectId: string;
  resultId: string;
  mode: ExportMode;
  category?: PsiIssueCategory;
}) {
  const target = await getAuditPsiTarget(input);
  if (!target.r2Key) {
    throw new AppError("NOT_FOUND");
  }

  const payloadJson = await getJsonFromR2(target.r2Key);

  return buildPsiExportFile({
    idField: "resultId",
    idValue: target.id,
    finalUrl: target.finalUrl,
    strategy: target.strategy,
    createdAt: target.createdAt,
    payloadJson,
    mode: input.mode,
    category: input.mode === "category" ? input.category : undefined,
  });
}

export const PsiAuditService = {
  getProjectPsiApiKey,
  saveProjectPsiApiKey,
  clearProjectPsiApiKey,
  getAuditPsiIssues,
  exportAuditPsi,
} as const;
