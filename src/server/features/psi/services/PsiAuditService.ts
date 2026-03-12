import { AppError } from "@/server/lib/errors";
import { getJsonFromR2, putJsonToR2 } from "@/server/lib/r2";
import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import { KeywordResearchRepository } from "@/server/features/keywords/repositories/KeywordResearchRepository";
import { PsiAuditRepository } from "@/server/features/psi/repositories/PsiAuditRepository";
import {
  PsiIssuesService,
  type PsiIssueCategory,
} from "@/server/features/psi/services/PsiIssuesService";
import { buildPsiExportFile } from "@/server/features/psi/services/psi-export";
import { PsiService } from "@/server/features/psi/services/PsiService";

type PsiStrategy = "mobile" | "desktop";
type PsiSource = "single" | "site";
type ExportMode = "full" | "issues" | "category";

type ResolvedPsiSource = {
  id: string;
  strategy: PsiStrategy;
  finalUrl: string;
  createdAt: string;
  r2Key: string | null;
};

async function resolvePsiSource(input: {
  projectId: string;
  userId: string;
  source: PsiSource;
  resultId: string;
}): Promise<ResolvedPsiSource> {
  if (input.source === "single") {
    const row = await PsiAuditRepository.getAuditResult({
      auditId: input.resultId,
      projectId: input.projectId,
      userId: input.userId,
    });

    if (!row) {
      throw new AppError("NOT_FOUND");
    }

    return {
      id: row.id,
      strategy: row.strategy,
      finalUrl: row.finalUrl,
      createdAt: row.createdAt,
      r2Key: row.r2Key,
    };
  }

  const site = await AuditRepository.getPsiResultById({
    psiResultId: input.resultId,
    projectId: input.projectId,
    userId: input.userId,
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

async function runAudit(input: {
  projectId: string;
  userId: string;
  url: string;
  strategy: PsiStrategy;
}) {
  const apiKey = await KeywordResearchRepository.getProjectPsiApiKey(
    input.projectId,
    input.userId,
  );

  if (!apiKey) {
    throw new AppError("VALIDATION_ERROR");
  }

  const auditId = crypto.randomUUID();

  try {
    const result = await PsiService.runAudit({
      url: input.url,
      strategy: input.strategy,
      apiKey,
    });

    const datePrefix = new Date().toISOString().slice(0, 10);
    const key = `psi/${input.projectId}/${datePrefix}/${auditId}.json`;
    const uploaded = await putJsonToR2(key, result.rawPayload);

    await PsiAuditRepository.createAuditResult({
      id: auditId,
      projectId: input.projectId,
      requestedUrl: result.requestedUrl,
      finalUrl: result.finalUrl,
      strategy: result.strategy,
      status: "completed",
      performanceScore: result.scores.performance,
      accessibilityScore: result.scores.accessibility,
      bestPracticesScore: result.scores["best-practices"],
      seoScore: result.scores.seo,
      firstContentfulPaint: result.metrics.firstContentfulPaint.displayValue,
      largestContentfulPaint:
        result.metrics.largestContentfulPaint.displayValue,
      totalBlockingTime: result.metrics.totalBlockingTime.displayValue,
      cumulativeLayoutShift: result.metrics.cumulativeLayoutShift.displayValue,
      speedIndex: result.metrics.speedIndex.displayValue,
      timeToInteractive: result.metrics.timeToInteractive.displayValue,
      lighthouseVersion: result.lighthouseVersion,
      r2Key: uploaded.key,
      payloadSizeBytes: uploaded.sizeBytes,
    });

    return {
      auditId,
      requestedUrl: result.requestedUrl,
      finalUrl: result.finalUrl,
      strategy: result.strategy,
      fetchedAt: result.fetchedAt,
      lighthouseVersion: result.lighthouseVersion,
      scores: result.scores,
      metrics: result.metrics,
    };
  } catch (error) {
    const requestedUrl = input.url.trim();
    const message =
      error instanceof Error ? error.message : "PSI request failed";

    await PsiAuditRepository.createAuditResult({
      id: auditId,
      projectId: input.projectId,
      requestedUrl,
      finalUrl: requestedUrl,
      strategy: input.strategy,
      status: "failed",
      errorMessage: message,
    });

    throw error;
  }
}

async function getProjectPsiApiKey(input: {
  projectId: string;
  userId: string;
}) {
  const apiKey = await KeywordResearchRepository.getProjectPsiApiKey(
    input.projectId,
    input.userId,
  );
  return { apiKey };
}

async function saveProjectPsiApiKey(input: {
  projectId: string;
  userId: string;
  apiKey: string;
}) {
  await KeywordResearchRepository.setProjectPsiApiKey(
    input.projectId,
    input.userId,
    input.apiKey.trim(),
  );
  return { success: true };
}

async function clearProjectPsiApiKey(input: {
  projectId: string;
  userId: string;
}) {
  await KeywordResearchRepository.clearProjectPsiApiKey(
    input.projectId,
    input.userId,
  );
  return { success: true };
}

async function listProjectPsiAudits(input: {
  projectId: string;
  userId: string;
  strategy?: PsiStrategy;
  limit: number;
}) {
  const rows = await PsiAuditRepository.listAuditResults({
    projectId: input.projectId,
    userId: input.userId,
    strategy: input.strategy,
    limit: input.limit,
  });

  return {
    rows: rows.map((row) => ({
      id: row.id,
      requestedUrl: row.requestedUrl,
      finalUrl: row.finalUrl,
      strategy: row.strategy,
      status: row.status,
      performanceScore: row.performanceScore,
      accessibilityScore: row.accessibilityScore,
      bestPracticesScore: row.bestPracticesScore,
      seoScore: row.seoScore,
      firstContentfulPaint: row.firstContentfulPaint,
      largestContentfulPaint: row.largestContentfulPaint,
      totalBlockingTime: row.totalBlockingTime,
      cumulativeLayoutShift: row.cumulativeLayoutShift,
      speedIndex: row.speedIndex,
      timeToInteractive: row.timeToInteractive,
      lighthouseVersion: row.lighthouseVersion,
      errorMessage: row.errorMessage,
      payloadSizeBytes: row.payloadSizeBytes,
      createdAt: row.createdAt,
    })),
  };
}

async function getProjectPsiAuditRaw(input: {
  projectId: string;
  userId: string;
  auditId: string;
}) {
  const row = await PsiAuditRepository.getAuditResult({
    auditId: input.auditId,
    projectId: input.projectId,
    userId: input.userId,
  });

  if (!row || !row.r2Key) {
    throw new AppError("NOT_FOUND");
  }

  const payloadJson = await getJsonFromR2(row.r2Key);
  return {
    id: row.id,
    strategy: row.strategy,
    finalUrl: row.finalUrl,
    createdAt: row.createdAt,
    payloadJson,
  };
}

async function getProjectPsiAuditIssues(input: {
  projectId: string;
  userId: string;
  auditId: string;
  category?: PsiIssueCategory;
}) {
  const row = await PsiAuditRepository.getAuditResult({
    auditId: input.auditId,
    projectId: input.projectId,
    userId: input.userId,
  });

  if (!row || !row.r2Key) {
    throw new AppError("NOT_FOUND");
  }

  const payloadJson = await getJsonFromR2(row.r2Key);
  const issues = PsiIssuesService.parseIssues(payloadJson, input.category);

  return {
    id: row.id,
    finalUrl: row.finalUrl,
    strategy: row.strategy,
    createdAt: row.createdAt,
    issues,
  };
}

async function exportProjectPsiAudit(input: {
  projectId: string;
  userId: string;
  auditId: string;
  mode: ExportMode;
  category?: PsiIssueCategory;
}) {
  const row = await PsiAuditRepository.getAuditResult({
    auditId: input.auditId,
    projectId: input.projectId,
    userId: input.userId,
  });

  if (!row || !row.r2Key) {
    throw new AppError("NOT_FOUND");
  }

  const payloadJson = await getJsonFromR2(row.r2Key);

  return buildPsiExportFile({
    idField: "auditId",
    idValue: row.id,
    finalUrl: row.finalUrl,
    strategy: row.strategy,
    createdAt: row.createdAt,
    payloadJson,
    mode: input.mode,
    category: input.mode === "category" ? input.category : undefined,
  });
}

async function getPsiIssuesBySource(input: {
  projectId: string;
  userId: string;
  source: PsiSource;
  resultId: string;
  category?: PsiIssueCategory;
}) {
  const target = await resolvePsiSource(input);
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

async function exportPsiBySource(input: {
  projectId: string;
  userId: string;
  source: PsiSource;
  resultId: string;
  mode: ExportMode;
  category?: PsiIssueCategory;
}) {
  const target = await resolvePsiSource(input);
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
  runAudit,
  getProjectPsiApiKey,
  saveProjectPsiApiKey,
  clearProjectPsiApiKey,
  listProjectPsiAudits,
  getProjectPsiAuditRaw,
  getProjectPsiAuditIssues,
  exportProjectPsiAudit,
  getPsiIssuesBySource,
  exportPsiBySource,
} as const;
