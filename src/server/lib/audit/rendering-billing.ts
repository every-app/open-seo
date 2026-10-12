import {
  finalizeHold,
  getOrCreateOrganizationCustomer,
  getUsageCreditsRemaining,
  holdCredits,
  type BillingCustomerContext,
  type UsageCreditHold,
} from "@/server/billing/subscription";
import { AppError } from "@/server/lib/errors";
import { captureServerEvent } from "@/server/lib/posthog";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import {
  estimateRenderingCredits,
  renderingCreditsNeededText,
  renderUsageCredits,
  type RenderUsage,
} from "@/shared/audit-rendering";
import {
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
} from "@/shared/billing";

// Autumn allows 24 hours at most; keep a minute of margin for clock skew. An
// audit that dies without settling returns its hold when the lock expires.
const LOCK_TTL_MS = 24 * 60 * 60_000 - 60_000;

/** Credits held for one rendered audit, monthly balance first, then top-up. */
export type RenderingLock = UsageCreditHold;

/**
 * Holds the worst-case rendering cost of a hosted audit before it starts:
 * every page falling back to Context. Throws INSUFFICIENT_CREDITS when the
 * monthly and top-up balances together cannot cover it. Returns no locks
 * outside hosted mode, where rendering is unmetered.
 *
 * Unlike a single DataForSEO call, one audit's hold is large enough to split:
 * the monthly balance covers what it can and top-up covers the rest.
 */
export async function lockRenderingCredits(input: {
  customer: BillingCustomerContext;
  auditId: string;
  maxPages: number;
}): Promise<RenderingLock[]> {
  if (!(await isHostedServerAuthMode())) return [];
  const { id: customerId } = await getOrCreateOrganizationCustomer(
    input.customer,
  );
  const required = estimateRenderingCredits(input.maxPages).high;
  const insufficient = new AppError(
    "INSUFFICIENT_CREDITS",
    renderingCreditsNeededText(input.maxPages),
  );
  const balances = await getUsageCreditsRemaining(customerId);
  // Clamp at 0: a balance can read negative after an overdraft.
  const monthly = Math.min(Math.max(balances.monthlyRemaining, 0), required);
  const topup = required - monthly;
  if (topup > Math.max(balances.topupRemaining, 0)) throw insufficient;

  const properties = {
    creditFeature: "site_audit",
    source: "site_audit_rendering",
    auditId: input.auditId,
  };
  const locks: RenderingLock[] = [];
  try {
    for (const [featureId, credits] of [
      [AUTUMN_SEO_DATA_BALANCE_FEATURE_ID, monthly],
      [AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID, topup],
    ] as const) {
      if (credits <= 0) continue;
      const { hold, allowed } = await holdCredits({
        customerId,
        featureId,
        estimatedCredits: credits,
        // Covers the audit's renders, not any DataForSEO calls.
        callIndexes: [],
        properties,
        ttlMs: LOCK_TTL_MS,
        lockPrefix: "render",
      });
      // The balance moved between the read and the hold.
      if (!allowed) throw insufficient;
      locks.push(hold);
    }
  } catch (error) {
    await releaseRenderingLocks(locks);
    throw error;
  }
  return locks;
}

/** Returns every held credit, for an audit that never started. */
export async function releaseRenderingLocks(locks: RenderingLock[]) {
  for (const lock of locks) {
    const { landed, error } = await finalizeHold(lock, 0, {
      source: "site_audit_rendering",
    });
    // The lock still expires on its own.
    if (!landed) {
      console.error("site_audit:render_lock_release_failed", {
        lockId: lock.lockId,
        error,
      });
    }
  }
}

/**
 * Charges the credits the audit used against its locks, monthly first, and
 * releases the rest. Never throws: a settlement that fails leaves the hold to
 * expire, which returns it to the customer.
 */
export async function settleRenderingLocks(input: {
  customer: BillingCustomerContext;
  auditId: string;
  locks: RenderingLock[];
  usage: RenderUsage;
}) {
  let remaining = renderUsageCredits(input.usage);
  const charged = { monthly: 0, topup: 0 };
  for (const lock of input.locks) {
    // A retried chunk can render a page twice; the hold is the most we charge.
    const charge = Math.min(remaining, lock.estimatedCredits);
    remaining -= charge;
    const { landed, error } = await finalizeHold(lock, charge, {
      source: "site_audit_rendering",
      auditId: input.auditId,
      ...input.usage,
    });
    if (!landed) {
      console.error("site_audit:render_settle_failed", {
        auditId: input.auditId,
        lockId: lock.lockId,
        charge,
        error,
      });
      continue;
    }
    if (lock.featureId === AUTUMN_SEO_DATA_BALANCE_FEATURE_ID) {
      charged.monthly += charge;
    } else {
      charged.topup += charge;
    }
  }
  const total = charged.monthly + charged.topup;
  if (total <= 0) return;
  await captureServerEvent({
    distinctId: input.customer.userId,
    event: "usage:credits_consume",
    organizationId: input.customer.organizationId,
    properties: {
      project_id: input.customer.projectId,
      credit_feature: "site_audit",
      source: "site_audit_rendering",
      monthly_credits: charged.monthly,
      topup_credits: charged.topup,
      total_credits: total,
      cloudflare_attempts: input.usage.cloudflareAttempts,
      context_credits: input.usage.contextCredits,
    },
  });
}
