import { createServerFn } from "@tanstack/react-start";
import { waitUntil } from "cloudflare:workers";
import { AuditService } from "@/server/features/audit/services/AuditService";
import type { AuditLimitTier } from "@/server/features/audit/services/audit-capacity";
import {
  customerHasManagedAccess,
  customerHasPaidPlan,
} from "@/server/billing/subscription";
import { AppError } from "@/server/lib/errors";
import { captureServerEvent } from "@/server/lib/posthog";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  deleteAuditSchema,
  getAuditHistorySchema,
  getAuditResultsSchema,
  getAuditStatusSchema,
  getCrawlProgressSchema,
  startAuditSchema,
} from "@/types/schemas/audit";

export const startAudit = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(startAuditSchema)
  .handler(async ({ data, context }) => {
    // The crawler runs on our Workers compute and isn't credit-metered, so
    // plan-tier limits are the abuse bound in hosted mode: free accounts get
    // one small audit at a time, paid keeps the full limits, and customers
    // with no Autumn product at all are turned away. Self-hosted isn't gated.
    let limitTier: AuditLimitTier = "paid";
    if (await isHostedServerAuthMode()) {
      const [hasManagedAccess, hasPaidPlan] = await Promise.all([
        customerHasManagedAccess(context.organizationId),
        customerHasPaidPlan(context.organizationId),
      ]);
      if (!hasManagedAccess) {
        throw new AppError("PAYMENT_REQUIRED", "Subscribe to run site audits");
      }
      limitTier = hasPaidPlan ? "paid" : "free";
    }

    const result = await AuditService.startAudit({
      actorUserId: context.userId,
      billingCustomer: context,
      projectId: context.projectId,
      startUrl: data.startUrl,
      maxPages: data.maxPages,
      lighthouseStrategy: data.lighthouseStrategy,
      limitTier,
    });

    waitUntil(
      captureServerEvent({
        distinctId: context.userId,
        event: "site_audit:start",
        organizationId: context.organizationId,
        properties: {
          project_id: context.projectId,
          max_pages: data.maxPages ?? 50,
          run_lighthouse: data.lighthouseStrategy !== "none",
          plan_tier: limitTier,
        },
      }),
    );

    return result;
  });

export const getAuditStatus = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getAuditStatusSchema)
  .handler(async ({ data, context }) => {
    return AuditService.getStatus(data.auditId, context.projectId);
  });

export const getAuditResults = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getAuditResultsSchema)
  .handler(async ({ data, context }) => {
    return AuditService.getResults(data.auditId, context.projectId);
  });

export const getAuditHistory = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getAuditHistorySchema)
  .handler(async ({ context }) => {
    return AuditService.getHistory(context.projectId);
  });

export const getCrawlProgress = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getCrawlProgressSchema)
  .handler(async ({ data, context }) => {
    return AuditService.getCrawlProgress(data.auditId, context.projectId);
  });

export const deleteAudit = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(deleteAuditSchema)
  .handler(async ({ data, context }) => {
    await AuditService.remove(data.auditId, context.projectId);
    return { success: true };
  });
