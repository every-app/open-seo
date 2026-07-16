import { env } from "cloudflare:workers";
import {
  customerHasManagedAccess,
  customerHasPaidPlan,
  type BillingCustomerContext,
} from "@/server/billing/subscription";
import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import {
  AUDIT_LIMITS,
  clampAuditMaxPages,
  getEstimatedAuditCapacity,
  type AuditLimitTier,
} from "@/server/features/audit/services/audit-capacity";
import { AppError } from "@/server/lib/errors";
import { AuditProgressKV } from "@/server/lib/audit/progress-kv";
import {
  parseAuditConfig,
  type AuditConfig,
  type LighthouseStrategy,
} from "@/server/lib/audit/types";
import { normalizeAndValidateStartUrl } from "@/server/lib/audit/url-policy";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";

// Plan-tier limits are the abuse bound in hosted mode: free accounts get one
// small audit at a time, paid keeps the full limits, and customers with no
// Autumn product at all are turned away. Self-hosted isn't gated.
async function resolveAuditLimitTier(
  organizationId: string,
): Promise<AuditLimitTier> {
  if (!(await isHostedServerAuthMode())) return "paid";
  const [hasManagedAccess, hasPaidPlan] = await Promise.all([
    customerHasManagedAccess(organizationId),
    customerHasPaidPlan(organizationId),
  ]);
  if (!hasManagedAccess) {
    throw new AppError("PAYMENT_REQUIRED", "Subscribe to run site audits");
  }
  return hasPaidPlan ? "paid" : "free";
}

async function startAudit(input: {
  actorUserId: string;
  billingCustomer: BillingCustomerContext;
  projectId: string;
  startUrl: string;
  maxPages?: number;
  lighthouseStrategy?: LighthouseStrategy;
  limitTier: AuditLimitTier;
}) {
  const limits = AUDIT_LIMITS[input.limitTier];
  const maxPages = clampAuditMaxPages(input.maxPages);
  if (maxPages > limits.maxPagesPerAudit) {
    throw new AppError("AUDIT_PAGE_LIMIT_EXCEEDED");
  }

  const lighthouseStrategy = input.lighthouseStrategy ?? "auto";
  const reservation = getEstimatedAuditCapacity({
    maxPages,
    lighthouseStrategy,
  });

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
    // Concurrency and capacity are enforced after the insert, not before: a
    // pre-insert read is a check-then-act race, so parallel requests would all
    // pass the free tier's one-running-audit gate. Post-insert, each request
    // sees at least its own row, so at most one racer can pass; the losers
    // roll back via the catch below. Two true racers may both abort — the
    // user just retries.
    const usage = await AuditRepository.getAuditUsageForUser(input.actorUserId);
    if (usage.runningCount > limits.maxRunningAudits) {
      throw new AppError("AUDIT_ALREADY_RUNNING");
    }
    if (usage.capacityUnits > limits.maxCapacityUnits) {
      throw new AppError("AUDIT_CAPACITY_REACHED");
    }

    await env.SITE_AUDIT_WORKFLOW.create({
      id: auditId,
      params: {
        auditId,
        billingCustomer: {
          userId: input.billingCustomer.userId,
          userEmail: input.billingCustomer.userEmail,
          organizationId: input.billingCustomer.organizationId,
          projectId: input.billingCustomer.projectId,
        },
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
  let audit = await AuditRepository.getAuditForProject(auditId, projectId);
  if (!audit)
    throw new AppError("NOT_FOUND", "Audit not found in this project.");

  // Self-heal audits whose workflow died without reaching the mark-failed
  // step (instance terminated, mark-failed itself failed, deploys, ...).
  // Without this they stay "running" forever and hold capacity.
  if (audit.status === "running" && audit.workflowInstanceId) {
    try {
      const instance = await env.SITE_AUDIT_WORKFLOW.get(
        audit.workflowInstanceId,
      );
      const { status } = await instance.status();
      if (status === "errored" || status === "terminated") {
        await AuditRepository.failAudit(audit.id, audit.workflowInstanceId);
        audit =
          (await AuditRepository.getAuditForProject(auditId, projectId)) ??
          audit;
      }
    } catch {
      // Instance not found or status unavailable — leave the audit as-is.
    }
  }

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
  const { audit, pages, lighthouse, issues } =
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
    issues,
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

    // A row can be "running" with no live workflow instance if a start failed
    // between the row insert and workflow creation and its rollback delete
    // also failed. Nothing to terminate then — deleting the row is the fix.
    const instance = await env.SITE_AUDIT_WORKFLOW.get(
      audit.workflowInstanceId,
    ).catch(() => null);
    try {
      await instance?.terminate();
    } catch (error) {
      // terminate() throws when the instance already reached a terminal state
      // (it completed or errored in the moment before the user hit stop). That
      // race shouldn't block deletion — re-check the live status and only fail
      // if the workflow is genuinely still running.
      const status = await instance?.status().catch(() => null);
      const stillRunning =
        status != null &&
        ["queued", "running", "paused", "waiting", "waitingForPause"].includes(
          status.status,
        );
      if (stillRunning) {
        console.error(`Failed to terminate audit workflow ${audit.id}:`, error);
        throw new AppError("CONFLICT", "Unable to stop the running audit.");
      }
    }
  }

  await AuditRepository.deleteAuditForProject(auditId, projectId);
}

export const AuditService = {
  resolveAuditLimitTier,
  startAudit,
  getStatus,
  getCrawlProgress,
  getResults,
  getHistory,
  remove,
} as const;
