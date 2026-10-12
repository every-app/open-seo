import { shouldCaptureAppErrorCode } from "@/shared/error-codes";
import { AuditService } from "@/server/features/audit/services/AuditService";
import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import { DataRefreshClaimRepository } from "../repositories/DataRefreshClaimRepository";
import { buildCacheKey } from "@/server/lib/r2-cache";
import { asAppError } from "@/server/lib/errors";
import type { BillingCustomerContext } from "@/server/billing/subscription";

async function start(
  projectId: string,
  domain: string | null,
  customer: BillingCustomerContext,
) {
  let key: string | null = null;
  let token: string | null = null;
  let auditStarted = false;
  try {
    if (!domain || (await AuditRepository.getLatestAuditForProject(projectId)))
      return null;
    key = await buildCacheKey("dashboard:first-audit", {
      projectId,
      organizationId: customer.organizationId,
    });
    token = await DataRefreshClaimRepository.claim(
      key,
      customer.organizationId,
    );
    if (!token) return { status: "pending" as const };
    // Close the gap between the first read and the claim, including manual scans.
    if (await AuditRepository.getLatestAuditForProject(projectId)) {
      await DataRefreshClaimRepository.finish(
        key,
        token,
        100 * 365 * 86400_000,
      );
      return null;
    }
    const limitTier = await AuditService.resolveAuditLimitTier(customer);
    await AuditService.startAudit({
      actorUserId: customer.userId,
      billingCustomer: customer,
      projectId,
      startUrl: `https://${domain}`,
      maxPages: 50,
      renderJavaScript: true,
      lighthouseStrategy: "auto",
      limitTier,
    });
    auditStarted = true;
    await DataRefreshClaimRepository.finish(key, token, 100 * 365 * 86400_000);
    return { status: "started" as const };
  } catch (error) {
    if (key && token)
      await DataRefreshClaimRepository.finish(key, token, 5 * 60_000).catch(
        (failure) =>
          console.error(
            "dashboard:first-audit claim release failed",
            { projectId },
            failure,
          ),
      );
    const code = asAppError(error)?.code ?? "INTERNAL_ERROR";
    if (shouldCaptureAppErrorCode(code))
      console.error(
        "dashboard:first-audit startup failed",
        { projectId, code },
        error,
      );
    else
      console.info("dashboard:first-audit could not start", {
        projectId,
        code,
      });
    if (auditStarted) return { status: "started" as const };
    return { status: "unavailable" as const, code };
  }
}
export const DashboardFirstAuditService = { start };
