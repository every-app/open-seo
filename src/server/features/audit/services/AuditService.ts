import { env } from "cloudflare:workers";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import {
  MAX_USER_AUDIT_USAGE,
  clampAuditMaxPages,
  getEstimatedAuditCapacity,
} from "@/server/features/audit/services/audit-capacity";
import { AppError } from "@/server/lib/errors";
import { AuditProgressKV } from "@/server/lib/audit/progress-kv";
import {
  parseAuditConfig,
  type AuditConfig,
  type LighthouseStrategy,
} from "@/server/lib/audit/types";
import { normalizeAndValidateStartUrl } from "@/server/lib/audit/url-policy";

async function startAudit(input: {
  actorUserId: string;
  billingCustomer: BillingCustomerContext;
  projectId: string;
  startUrl: string;
  maxPages?: number;
  lighthouseStrategy?: LighthouseStrategy;
}) {
  const maxPages = clampAuditMaxPages(input.maxPages);
  const lighthouseStrategy = input.lighthouseStrategy ?? "auto";
  const reservation = getEstimatedAuditCapacity({
    maxPages,
    lighthouseStrategy,
  });

  const currentUsage = await AuditRepository.getAuditCapacityUsageForUser(
    input.actorUserId,
  );

  if (currentUsage + reservation.total > MAX_USER_AUDIT_USAGE) {
    throw new AppError("AUDIT_CAPACITY_REACHED");
  }

  const auditId = crypto.randomUUID();
  const config: AuditConfig = { maxPages, lighthouseStrategy };
  const startUrl = await normalizeAndValidateStartUrl(input.startUrl);

  await AuditRepository.createAudit({
    id: auditId,
    projectId: input.projectId,
    startedByUserId: input.actorUserId,
    startUrl,
    workflowInstanceId: auditId,
    config,
    pagesTotal: reservation.pagesTotal,
    lighthouseTotal: reservation.lighthouseTotal,
  });

  try {
    await env.SITE_AUDIT_WORKFLOW.create({
      id: auditId,
      params: {
        auditId,
        billingCustomer: input.billingCustomer,
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
    lighthouseTotal: audit.lighthouseTotal,
    lighthouseCompleted: audit.lighthouseCompleted,
    lighthouseFailed: audit.lighthouseFailed,
    currentPhase: audit.currentPhase,
    startedAt: audit.startedAt,
    completedAt: audit.completedAt,
  };
}

async function getResults(auditId: string, projectId: string) {
  const { audit, pages, lighthouse } =
    await AuditRepository.getAuditResultsForProject(auditId, projectId);

  if (!audit) throw new AppError("NOT_FOUND");

  const parsedConfig = parseAuditConfig(audit.config);
  if (!parsedConfig) {
    throw new AppError("INTERNAL_ERROR", "Invalid audit configuration");
  }

  return {
    audit: {
      id: audit.id,
      startUrl: audit.startUrl,
      status: audit.status,
      pagesCrawled: audit.pagesCrawled,
      pagesTotal: audit.pagesTotal,
      startedAt: audit.startedAt,
      completedAt: audit.completedAt,
      config: parsedConfig,
    },
    pages,
    lighthouse,
  };
}

async function getHistory(projectId: string) {
  const auditList = await AuditRepository.getAuditsByProject(projectId);

  return auditList.map((audit) => {
    const parsedConfig = parseAuditConfig(audit.config);
    const ranLighthouse = parsedConfig?.lighthouseStrategy !== "none";

    return {
      id: audit.id,
      startUrl: audit.startUrl,
      status: audit.status,
      pagesCrawled: audit.pagesCrawled,
      pagesTotal: audit.pagesTotal,
      ranLighthouse,
      startedAt: audit.startedAt,
      completedAt: audit.completedAt,
    };
  });
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
