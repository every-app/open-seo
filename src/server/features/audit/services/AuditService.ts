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
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import {
  clampAuditMaxPages,
  getEstimatedAuditCapacity,
  MAX_USER_AUDIT_USAGE,
} from "@/server/features/audit/services/audit-capacity";
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
  actorUserId: string;
  projectId: string;
  startUrl: string;
  maxPages?: number;
  psiStrategy?: PsiStrategy;
  psiApiKey?: string;
}) {
  const maxPages = clampAuditMaxPages(input.maxPages);
  const psiStrategy = input.psiStrategy ?? "auto";

  const reservation = getEstimatedAuditCapacity({
    maxPages,
    psiStrategy,
  });

  const currentUsage = await AuditRepository.getAuditCapacityUsageForUser(
    input.actorUserId,
  );

  if (currentUsage + reservation.total > MAX_USER_AUDIT_USAGE) {
    throw new AppError("AUDIT_CAPACITY_REACHED");
  }

  const auditId = crypto.randomUUID();

  const shouldRunPsi = psiStrategy !== "none";
  let resolvedPsiApiKey = input.psiApiKey?.trim();

  if (shouldRunPsi && !resolvedPsiApiKey) {
    resolvedPsiApiKey =
      (await ProjectRepository.getProjectPsiApiKey(input.projectId)) ??
      undefined;
  }

  if (shouldRunPsi && !resolvedPsiApiKey) {
    throw new Error("PSI API key is not set for this project.");
  }

  const config: AuditConfig = {
    maxPages,
    psiStrategy,
    // PSI key is used for Google quota/abuse control (non-billing).
    psiApiKey: resolvedPsiApiKey,
  };

  const startUrl = await normalizeAndValidateStartUrl(input.startUrl);

  await AuditRepository.createAudit({
    id: auditId,
    projectId: input.projectId,
    startedByUserId: input.actorUserId,
    startUrl,
    workflowInstanceId: auditId,
    config,
    pagesTotal: reservation.pagesTotal,
    psiTotal: reservation.psiTotal,
  });

  // Trigger the Cloudflare Workflow
  try {
    await env.SITE_AUDIT_WORKFLOW.create({
      id: auditId,
      params: {
        auditId,
        projectId: input.projectId,
        startUrl,
        config,
      },
    });
  } catch (error) {
    try {
      const instance = await env.SITE_AUDIT_WORKFLOW.get(auditId);
      await instance.terminate();
    } catch {
      // The workflow may never have been created, or may already be gone.
    }
    await AuditRepository.deleteAuditForProject(auditId, input.projectId);
    throw error;
  }

  return { auditId };
}

async function getStatus(auditId: string, projectId: string) {
  const audit = await AuditRepository.getAuditForProject(auditId, projectId);
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

async function getResults(auditId: string, projectId: string) {
  const { audit, pages, psi } = await AuditRepository.getAuditResultsForProject(
    auditId,
    projectId,
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

async function getHistory(projectId: string) {
  const auditList = await AuditRepository.getAuditsByProject(projectId);

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

async function getCrawlProgress(auditId: string, projectId: string) {
  const audit = await AuditRepository.getAuditForProject(auditId, projectId);
  if (!audit) {
    throw new AppError("NOT_FOUND");
  }
  return AuditProgressKV.getCrawledUrls(auditId);
}

async function remove(auditId: string, projectId: string) {
  const audit = await AuditRepository.getAuditForProject(auditId, projectId);
  if (!audit) {
    throw new AppError("NOT_FOUND");
  }
  if (audit.status === "running") {
    if (!audit.workflowInstanceId) {
      throw new AppError(
        "CONFLICT",
        "Cannot delete a running audit without workflow context.",
      );
    }

    try {
      const instance = await env.SITE_AUDIT_WORKFLOW.get(
        audit.workflowInstanceId,
      );
      await instance.terminate();
    } catch (error) {
      console.error(`Failed to terminate audit workflow ${audit.id}:`, error);
      throw new AppError("CONFLICT", "Unable to stop the running audit.");
    }
  }
  await AuditRepository.deleteAuditForProject(auditId, projectId);
}

export const AuditService = {
  startAudit,
  getStatus,
  getCrawlProgress,
  getResults,
  getHistory,
  remove,
} as const;
