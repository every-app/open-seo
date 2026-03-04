import { createServerFn } from "@tanstack/react-start";
import { authenticatedServerFunctionMiddleware } from "@/serverFunctions/middleware";
import { AppError } from "@/server/lib/errors";
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
import { PsiService } from "@/server/services/PsiService";
import { KeywordResearchRepository } from "@/server/repositories/KeywordResearchRepository";
import { PsiAuditRepository } from "@/server/repositories/PsiAuditRepository";
import { AuditRepository } from "@/server/repositories/AuditRepository";
import { getJsonFromR2, putJsonToR2 } from "@/server/lib/r2";
import { PsiIssuesService } from "@/server/services/PsiIssuesService";

async function resolvePsiSource(input: {
  projectId: string;
  userId: string;
  source: "single" | "site";
  resultId: string;
}) {
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

export const runPsiAudit = createServerFn({ method: "POST" })
  .middleware(authenticatedServerFunctionMiddleware)
  .inputValidator((data: unknown) => psiAuditSchema.parse(data))
  .handler(async ({ data, context }) => {
    const apiKey = await KeywordResearchRepository.getProjectPsiApiKey(
      data.projectId,
      context.userId,
    );

    if (!apiKey) {
      throw new AppError("VALIDATION_ERROR");
    }

    const auditId = crypto.randomUUID();
    try {
      const result = await PsiService.runAudit({
        url: data.url,
        strategy: data.strategy,
        apiKey,
      });

      const now = new Date();
      const datePrefix = now.toISOString().slice(0, 10);
      const key = `psi/${data.projectId}/${datePrefix}/${auditId}.json`;
      const uploaded = await putJsonToR2(key, result.rawPayload);

      await PsiAuditRepository.createAuditResult({
        id: auditId,
        projectId: data.projectId,
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
        cumulativeLayoutShift:
          result.metrics.cumulativeLayoutShift.displayValue,
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
      const requestedUrl = data.url.trim();
      const message =
        error instanceof Error ? error.message : "PSI request failed";

      await PsiAuditRepository.createAuditResult({
        id: auditId,
        projectId: data.projectId,
        requestedUrl,
        finalUrl: requestedUrl,
        strategy: data.strategy,
        status: "failed",
        errorMessage: message,
      });

      throw error;
    }
  });

export const getProjectPsiApiKey = createServerFn({ method: "POST" })
  .middleware(authenticatedServerFunctionMiddleware)
  .inputValidator((data: unknown) => psiProjectSchema.parse(data))
  .handler(async ({ data, context }) => {
    // This PSI key is intentionally treated as low-sensitivity operational config
    // (Google abuse-control), not a direct billing secret.
    const apiKey = await KeywordResearchRepository.getProjectPsiApiKey(
      data.projectId,
      context.userId,
    );
    return { apiKey };
  });

export const saveProjectPsiApiKey = createServerFn({ method: "POST" })
  .middleware(authenticatedServerFunctionMiddleware)
  .inputValidator((data: unknown) => psiProjectKeySchema.parse(data))
  .handler(async ({ data, context }) => {
    // Same tradeoff: persisted for convenience across PSI + Site Audit flows.
    await KeywordResearchRepository.setProjectPsiApiKey(
      data.projectId,
      context.userId,
      data.apiKey.trim(),
    );
    return { success: true };
  });

export const clearProjectPsiApiKey = createServerFn({ method: "POST" })
  .middleware(authenticatedServerFunctionMiddleware)
  .inputValidator((data: unknown) => psiProjectSchema.parse(data))
  .handler(async ({ data, context }) => {
    await KeywordResearchRepository.clearProjectPsiApiKey(
      data.projectId,
      context.userId,
    );
    return { success: true };
  });

export const listProjectPsiAudits = createServerFn({ method: "POST" })
  .middleware(authenticatedServerFunctionMiddleware)
  .inputValidator((data: unknown) => psiAuditListSchema.parse(data))
  .handler(async ({ data, context }) => {
    const rows = await PsiAuditRepository.listAuditResults({
      projectId: data.projectId,
      userId: context.userId,
      strategy: data.strategy,
      limit: data.limit,
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
  });

export const getProjectPsiAuditRaw = createServerFn({ method: "POST" })
  .middleware(authenticatedServerFunctionMiddleware)
  .inputValidator((data: unknown) => psiAuditDetailsSchema.parse(data))
  .handler(async ({ data, context }) => {
    const row = await PsiAuditRepository.getAuditResult({
      auditId: data.auditId,
      projectId: data.projectId,
      userId: context.userId,
    });

    if (!row) {
      throw new AppError("NOT_FOUND");
    }

    if (!row.r2Key) {
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
  });

export const getProjectPsiAuditIssues = createServerFn({ method: "POST" })
  .middleware(authenticatedServerFunctionMiddleware)
  .inputValidator((data: unknown) => psiIssueFilterSchema.parse(data))
  .handler(async ({ data, context }) => {
    const row = await PsiAuditRepository.getAuditResult({
      auditId: data.auditId,
      projectId: data.projectId,
      userId: context.userId,
    });

    if (!row) {
      throw new AppError("NOT_FOUND");
    }

    if (!row.r2Key) {
      throw new AppError("NOT_FOUND");
    }

    const payloadJson = await getJsonFromR2(row.r2Key);
    const issues = PsiIssuesService.parseIssues(payloadJson, data.category);

    return {
      id: row.id,
      finalUrl: row.finalUrl,
      strategy: row.strategy,
      createdAt: row.createdAt,
      issues,
    };
  });

export const exportProjectPsiAudit = createServerFn({ method: "POST" })
  .middleware(authenticatedServerFunctionMiddleware)
  .inputValidator((data: unknown) => psiExportSchema.parse(data))
  .handler(async ({ data, context }) => {
    const row = await PsiAuditRepository.getAuditResult({
      auditId: data.auditId,
      projectId: data.projectId,
      userId: context.userId,
    });

    if (!row) {
      throw new AppError("NOT_FOUND");
    }

    if (!row.r2Key) {
      throw new AppError("NOT_FOUND");
    }

    const payloadJson = await getJsonFromR2(row.r2Key);
    const safeDate = row.createdAt.replace(/[:.]/g, "-");
    const baseName = `psi-${row.strategy}-${safeDate}`;

    if (data.mode === "full") {
      return {
        filename: `${baseName}-full.json`,
        content: payloadJson,
      };
    }

    const category = data.mode === "category" ? data.category : undefined;
    const issues = PsiIssuesService.parseIssues(payloadJson, category);

    return {
      filename:
        data.mode === "category" && category
          ? `${baseName}-${category}-issues.json`
          : `${baseName}-issues.json`,
      content: JSON.stringify(
        {
          auditId: row.id,
          finalUrl: row.finalUrl,
          strategy: row.strategy,
          createdAt: row.createdAt,
          category: category ?? "all",
          issues,
        },
        null,
        2,
      ),
    };
  });

export const getPsiIssuesBySource = createServerFn({ method: "POST" })
  .middleware(authenticatedServerFunctionMiddleware)
  .inputValidator((data: unknown) => psiUnifiedIssueSchema.parse(data))
  .handler(async ({ data, context }) => {
    const target = await resolvePsiSource({
      projectId: data.projectId,
      userId: context.userId,
      source: data.source,
      resultId: data.resultId,
    });

    if (!target.r2Key) {
      throw new AppError("NOT_FOUND");
    }

    const payloadJson = await getJsonFromR2(target.r2Key);
    const issues = PsiIssuesService.parseIssues(payloadJson, data.category);

    return {
      id: target.id,
      finalUrl: target.finalUrl,
      strategy: target.strategy,
      createdAt: target.createdAt,
      issues,
    };
  });

export const exportPsiBySource = createServerFn({ method: "POST" })
  .middleware(authenticatedServerFunctionMiddleware)
  .inputValidator((data: unknown) => psiUnifiedExportSchema.parse(data))
  .handler(async ({ data, context }) => {
    const target = await resolvePsiSource({
      projectId: data.projectId,
      userId: context.userId,
      source: data.source,
      resultId: data.resultId,
    });

    if (!target.r2Key) {
      throw new AppError("NOT_FOUND");
    }

    const payloadJson = await getJsonFromR2(target.r2Key);
    const safeDate = target.createdAt.replace(/[:.]/g, "-");
    const baseName = `psi-${target.strategy}-${safeDate}`;

    if (data.mode === "full") {
      return {
        filename: `${baseName}-full.json`,
        content: payloadJson,
      };
    }

    const category = data.mode === "category" ? data.category : undefined;
    const issues = PsiIssuesService.parseIssues(payloadJson, category);

    return {
      filename:
        data.mode === "category" && category
          ? `${baseName}-${category}-issues.json`
          : `${baseName}-issues.json`,
      content: JSON.stringify(
        {
          resultId: target.id,
          finalUrl: target.finalUrl,
          strategy: target.strategy,
          createdAt: target.createdAt,
          category: category ?? "all",
          issues,
        },
        null,
        2,
      ),
    };
  });
