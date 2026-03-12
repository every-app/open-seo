/**
 * Business logic layer for site audits.
 * Orchestrates between the workflow trigger, repository, and data formatting.
 */
import { env } from "cloudflare:workers";
import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import { AuditProgressKV } from "@/server/lib/audit/progress-kv";
import { normalizeAndValidateStartUrl } from "@/server/lib/audit/url-policy";
import { AppError } from "@/server/lib/errors";
import type { AuditConfig, PsiStrategy } from "@/server/lib/audit/types";
import { KeywordResearchRepository } from "@/server/features/keywords/repositories/KeywordResearchRepository";
import { jsonCodec } from "@/shared/json";
import { z } from "zod";

const auditConfigSchema = z.object({
  maxPages: z.number().int().min(10).max(10_000),
  psiStrategy: z.enum(["auto", "all", "manual", "none"]),
  psiApiKey: z.string().optional(),
});

const auditConfigCodec = jsonCodec(auditConfigSchema);

function parseAuditConfig(configRaw: string | null): AuditConfig | null {
  if (!configRaw) return null;
  const result = auditConfigCodec.safeParse(configRaw);
  return result.success ? result.data : null;
}

async function startAudit(input: {
  userId: string;
  projectId: string;
  startUrl: string;
  maxPages?: number;
  psiStrategy?: PsiStrategy;
  psiApiKey?: string;
}) {
  const hasProjectAccess = await AuditRepository.isProjectOwnedByUser(
    input.projectId,
    input.userId,
  );
  if (!hasProjectAccess) {
    throw new AppError("FORBIDDEN");
  }

  const auditId = crypto.randomUUID();

  const shouldRunPsi = (input.psiStrategy ?? "auto") !== "none";
  let resolvedPsiApiKey = input.psiApiKey?.trim();

  if (shouldRunPsi && !resolvedPsiApiKey) {
    resolvedPsiApiKey =
      (await KeywordResearchRepository.getProjectPsiApiKey(
        input.projectId,
        input.userId,
      )) ?? undefined;
  }

  if (shouldRunPsi && !resolvedPsiApiKey) {
    throw new Error("PSI API key is not set for this project.");
  }

  const config: AuditConfig = {
    maxPages: Math.min(Math.max(input.maxPages ?? 50, 10), 10_000),
    psiStrategy: input.psiStrategy ?? "auto",
    // PSI key is used for Google quota/abuse control (non-billing).
    psiApiKey: resolvedPsiApiKey,
  };

  const startUrl = await normalizeAndValidateStartUrl(input.startUrl);

  // Trigger the Cloudflare Workflow
  const instance = await env.SITE_AUDIT_WORKFLOW.create({
    id: auditId,
    params: {
      auditId,
      projectId: input.projectId,
      startUrl,
      config,
    },
  });

  // Create the audit row in D1
  await AuditRepository.createAudit({
    id: auditId,
    projectId: input.projectId,
    userId: input.userId,
    startUrl,
    workflowInstanceId: instance.id,
    config,
  });

  return { auditId };
}

async function getStatus(auditId: string, userId: string) {
  const audit = await AuditRepository.getAuditForUser(auditId, userId);
  if (!audit) throw new AppError("NOT_FOUND");

  return {
    id: audit.id,
    startUrl: audit.startUrl,
    status: audit.status,
    pagesCrawled: audit.pagesCrawled,
    pagesTotal: audit.pagesTotal,
    psiTotal: audit.psiTotal,
    psiCompleted: audit.psiCompleted,
    psiFailed: audit.psiFailed,
    currentPhase: audit.currentPhase,
    startedAt: audit.startedAt,
    completedAt: audit.completedAt,
  };
}

async function getResults(auditId: string, userId: string) {
  const { audit, pages, psi } = await AuditRepository.getAuditResultsForUser(
    auditId,
    userId,
  );

  if (!audit) throw new AppError("NOT_FOUND");

  const parsedConfig = parseAuditConfig(audit.config);
  if (!parsedConfig) {
    throw new AppError("INTERNAL_ERROR", "Invalid audit configuration");
  }
  const { psiApiKey: _psiApiKey, ...safeConfig } = parsedConfig;

  return {
    audit: {
      id: audit.id,
      startUrl: audit.startUrl,
      status: audit.status,
      pagesCrawled: audit.pagesCrawled,
      pagesTotal: audit.pagesTotal,
      startedAt: audit.startedAt,
      completedAt: audit.completedAt,
      config: safeConfig,
    },
    pages,
    psi,
  };
}

async function getHistory(projectId: string, userId: string) {
  const hasProjectAccess = await AuditRepository.isProjectOwnedByUser(
    projectId,
    userId,
  );
  if (!hasProjectAccess) {
    throw new AppError("FORBIDDEN");
  }

  const auditList = await AuditRepository.getAuditsByProjectForUser(
    projectId,
    userId,
  );

  const didRunPsi = (configRaw: string | null) => {
    const parsed = parseAuditConfig(configRaw);
    return parsed?.psiStrategy != null && parsed.psiStrategy !== "none";
  };

  return auditList.map((a) => ({
    id: a.id,
    startUrl: a.startUrl,
    status: a.status,
    pagesCrawled: a.pagesCrawled,
    pagesTotal: a.pagesTotal,
    ranPsi: didRunPsi(a.config),
    startedAt: a.startedAt,
    completedAt: a.completedAt,
  }));
}

async function getCrawlProgress(auditId: string, userId: string) {
  const audit = await AuditRepository.getAuditForUser(auditId, userId);
  if (!audit) {
    throw new AppError("NOT_FOUND");
  }
  return AuditProgressKV.getCrawledUrls(auditId);
}

async function remove(auditId: string, userId: string) {
  const audit = await AuditRepository.getAuditForUser(auditId, userId);
  if (!audit) {
    throw new AppError("NOT_FOUND");
  }
  await AuditRepository.deleteAuditForUser(auditId, userId);
}

export const AuditService = {
  startAudit,
  getStatus,
  getCrawlProgress,
  getResults,
  getHistory,
  remove,
} as const;
