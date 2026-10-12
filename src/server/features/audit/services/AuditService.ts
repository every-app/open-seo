import { isAuditRenderingAllowed } from "@/server/lib/audit/rendering-policy";
import {
  lockRenderingCredits,
  releaseRenderingLocks,
  type RenderingLock,
} from "@/server/lib/audit/rendering-billing";
import { env } from "cloudflare:workers";
import {
  customerHasPaidPlan,
  getOrCreateOrganizationCustomer,
  type BillingCustomerContext,
} from "@/server/billing/subscription";
import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import { CrawlerCredentialService } from "@/server/features/audit/services/CrawlerCredentialService";
import {
  AUDIT_LIMITS,
  clampAuditMaxPages,
  getEstimatedAuditCapacity,
  type AuditLimitTier,
} from "@/server/features/audit/services/audit-capacity";
import { AppError } from "@/server/lib/errors";
import { RENDERED_MAX_AUDIT_PAGES } from "@/shared/audit-limits";
import { AuditProgressKV } from "@/server/lib/audit/progress-kv";
import {
  parseAuditConfig,
  type AuditConfig,
  type LighthouseStrategy,
} from "@/server/lib/audit/types";
import {
  normalizeAndValidateStartUrl,
  resolveStartUrlRedirects,
} from "@/server/lib/audit/url-policy";
import { reconcileRunningAudit } from "@/server/features/audit/services/auditReconciler";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";

// Free accounts keep bounded audit capacity; rendering reserves usage credits.
async function resolveAuditLimitTier(
  customer: BillingCustomerContext,
): Promise<AuditLimitTier> {
  if (!(await isHostedServerAuthMode())) return "self_hosted";
  await getOrCreateOrganizationCustomer(customer);
  return (await customerHasPaidPlan(customer.organizationId)) ? "paid" : "free";
}

async function startAudit(input: {
  actorUserId: string;
  billingCustomer: BillingCustomerContext;
  projectId: string;
  startUrl: string;
  maxPages?: number;
  lighthouseStrategy?: LighthouseStrategy;
  limitTier: AuditLimitTier;
  renderJavaScript?: boolean;
}) {
  const renderJavaScript = input.renderJavaScript ?? false;
  if (renderJavaScript && !(await isAuditRenderingAllowed())) {
    throw new AppError(
      "AUDIT_RENDERING_UNAVAILABLE",
      "JavaScript rendering is not available on this deployment. It needs a Cloudflare deployment with Browser Run, or CONTEXT_API_KEY. Run the audit without rendering instead.",
    );
  }
  const limits = AUDIT_LIMITS[input.limitTier];
  const maxPages = clampAuditMaxPages(input.maxPages);
  if (maxPages > limits.maxPagesPerAudit) {
    throw new AppError("AUDIT_PAGE_LIMIT_EXCEEDED");
  }
  if (renderJavaScript && maxPages > RENDERED_MAX_AUDIT_PAGES) {
    throw new AppError(
      "AUDIT_PAGE_LIMIT_EXCEEDED",
      `Audits that render JavaScript are limited to ${RENDERED_MAX_AUDIT_PAGES.toLocaleString("en-US")} pages.`,
    );
  }

  const lighthouseStrategy = input.lighthouseStrategy ?? "auto";
  const reservation = getEstimatedAuditCapacity({
    maxPages,
    lighthouseStrategy,
  });

  const auditId = crypto.randomUUID();
  const organizationId = input.billingCustomer.organizationId;
  const requestedUrl = await normalizeAndValidateStartUrl(input.startUrl);
  // The probe itself can be rate limited, so it carries the credential too.
  let credential = await CrawlerCredentialService.resolveCrawlerAccess(
    organizationId,
    input.projectId,
    new URL(requestedUrl).hostname,
  );
  // Anchor the audit to the site's real origin: a start domain that 301s
  // elsewhere (…net -> …com, apex -> www) would otherwise dead-end after
  // one page at the same-origin crawl boundary.
  const probe = await resolveStartUrlRedirects(
    requestedUrl,
    await CrawlerCredentialService.openCrawlerAccess(credential?.sealed),
  );
  const startUrl = probe.url;
  const startHost = new URL(startUrl).hostname;
  if (startHost !== new URL(requestedUrl).hostname) {
    credential = await CrawlerCredentialService.resolveCrawlerAccess(
      organizationId,
      input.projectId,
      startHost,
    );
  }

  const config: AuditConfig = {
    maxPages,
    lighthouseStrategy,
    renderJavaScript,
    // Shopify storefronts answer with `powered-by: Shopify`; knowing this is
    // what lets the report explain a throttled crawl instead of shrugging.
    sitePlatform: probe.poweredBy?.toLowerCase().includes("shopify")
      ? "shopify"
      : undefined,
    crawlerCredentialId: credential?.id,
  };

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

  let renderLocks: RenderingLock[] = [];
  try {
    // Concurrency and capacity are enforced after the insert, not before: a
    // pre-insert read is a check-then-act race, so parallel requests would all
    // pass the free tier's running-audits gate. Post-insert, each request sees
    // at least its own row, so racers can't all slip under the limit; the
    // losers roll back via the catch below. Racers at the boundary may all
    // abort — the user just retries. Usage counts per ORGANIZATION, not per
    // user: the free ceiling is the org's, so N members don't multiply it.
    const usage = await AuditRepository.getAuditUsageForOrganization(
      input.billingCustomer.organizationId,
    );
    if (usage.runningCount > limits.maxRunningAudits) {
      throw new AppError("AUDIT_ALREADY_RUNNING");
    }
    if (usage.capacityUnits > limits.maxCapacityUnits) {
      throw new AppError("AUDIT_CAPACITY_REACHED");
    }
    // Holds the worst-case rendering cost for the whole audit. Refused here,
    // the audit never runs; the workflow settles the hold when it ends.
    if (renderJavaScript) {
      renderLocks = await lockRenderingCredits({
        customer: input.billingCustomer,
        auditId,
        maxPages,
      });
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
        access: credential?.sealed,
        renderLocks,
      },
    });
  } catch (error) {
    try {
      const instance = await env.SITE_AUDIT_WORKFLOW.get(auditId);
      await instance.terminate();
    } catch {
      // The workflow may never have been created, or may already be gone.
    }
    await releaseRenderingLocks(renderLocks);

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
  // step (instance terminated/errored, instance expired from retention, ...).
  // Without this they stay "running" forever and hold capacity.
  if (audit.status === "running") {
    const reconciled = await reconcileRunningAudit(audit);
    if (reconciled) {
      audit =
        (await AuditRepository.getAuditForProject(auditId, projectId)) ?? audit;
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
    errorCode: audit.errorCode,
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
  // Best-effort: drop the crawl scratchpad DO with the audit (it lives in
  // the open-seo-audit worker, behind the AuditEngine RPC). A missed destroy
  // self-cleans via the DO's 7-day alarm.
  try {
    await env.AUDIT_ENGINE.destroyScratchpad(auditId);
  } catch (error) {
    console.warn(`Failed to destroy audit scratchpad ${auditId}:`, error);
  }
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
