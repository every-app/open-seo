import type { LighthouseStrategy } from "@/server/lib/audit/types";
import {
  DEFAULT_AUDIT_PAGES,
  FREE_MAX_AUDIT_PAGES,
  MIN_AUDIT_PAGES,
  PAID_MAX_AUDIT_PAGES,
} from "@/shared/audit-limits";

export type AuditLimitTier = "free" | "paid";

// The crawler runs on our Workers compute and isn't credit-metered, so these
// per-tier bounds are the abuse control: free accounts cost nothing to create,
// so they get one small audit at a time and a modest total budget. Paid gets
// bounds sized for real sites rather than abuse (a payment method on file is
// the deterrent). Self-hosted deployments resolve to the paid tier.
export const AUDIT_LIMITS: Record<
  AuditLimitTier,
  {
    maxPagesPerAudit: number;
    maxCapacityUnits: number;
    maxRunningAudits: number;
  }
> = {
  free: {
    maxPagesPerAudit: FREE_MAX_AUDIT_PAGES,
    maxCapacityUnits: 2_000,
    maxRunningAudits: 1,
  },
  paid: {
    maxPagesPerAudit: PAID_MAX_AUDIT_PAGES,
    maxCapacityUnits: 100_000,
    maxRunningAudits: Number.POSITIVE_INFINITY,
  },
};

export function clampAuditMaxPages(maxPages?: number) {
  return Math.min(
    Math.max(maxPages ?? DEFAULT_AUDIT_PAGES, MIN_AUDIT_PAGES),
    PAID_MAX_AUDIT_PAGES,
  );
}

export function getEstimatedAuditCapacity(input: {
  maxPages?: number;
  lighthouseStrategy?: LighthouseStrategy;
}) {
  const pagesTotal = clampAuditMaxPages(input.maxPages);
  const lighthouseStrategy = input.lighthouseStrategy ?? "auto";
  // "auto" samples up to 10 pages, checked on mobile + desktop.
  const lighthouseChecks = lighthouseStrategy === "auto" ? 20 : 0;

  return {
    pagesTotal,
    lighthouseTotal: lighthouseChecks,
    total: pagesTotal + lighthouseChecks,
  };
}
