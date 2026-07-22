import { env } from "cloudflare:workers";
import type { EnsuredUserContext } from "@/middleware/ensure-user/types";
import {
  AUTUMN_MANAGED_ACCESS_FEATURE_ID,
  AUTUMN_PAID_PLAN_FEATURE_ID,
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_CREDITS_PER_USD,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
  SEO_DATA_COST_MARKUP,
  roundUsdForBilling,
} from "@/shared/billing";
import type { CreditFeature } from "@/shared/billing-credit-features";
import { autumn, AUTUMN_TRACK_RETRY_OPTIONS } from "@/server/billing/autumn";
import { captureServerEvent } from "@/server/lib/posthog";
import { AppError } from "@/server/lib/errors";

export type BillingCustomerContext = Pick<
  EnsuredUserContext,
  "organizationId" | "userEmail" | "userId"
> & {
  projectId?: string;
};

// Existence is monotonic and the Autumn customer id is always the org id we
// pass, so once we've confirmed a customer exists we can skip the round trip
// and reuse the org id. Callers only need `.id` (they read balances via
// `check`), and a degraded Autumn API otherwise added seconds to every hot-path
// request that ensured the customer (incident 2026-07-06). Long TTL is safe:
// we only ever cache confirmed existence, never absence.
const CUSTOMER_ENSURED_TTL_SECONDS = 24 * 60 * 60;
const customerEnsuredKey = (organizationId: string) =>
  `autumn:customer-ensured:${organizationId}`;

export async function getOrCreateOrganizationCustomer(
  context: BillingCustomerContext,
): Promise<{ id: string }> {
  const cacheKey = customerEnsuredKey(context.organizationId);
  try {
    if (await env.KV.get(cacheKey)) {
      return { id: context.organizationId };
    }
  } catch (error) {
    console.warn("billing.customer-cache-read failed:", error);
  }

  const customer = await autumn.customers.getOrCreate({
    customerId: context.organizationId,
    email: context.userEmail,
  });

  if (!customer.id) {
    throw new AppError("INTERNAL_ERROR", "Failed to resolve billing customer");
  }

  try {
    await env.KV.put(cacheKey, "1", {
      expirationTtl: CUSTOMER_ENSURED_TTL_SECONDS,
    });
  } catch (error) {
    console.warn("billing.customer-cache-write failed:", error);
  }

  return { id: customer.id };
}

export async function customerHasPaidPlan(customerId: string) {
  const result = await autumn.check({
    customerId,
    featureId: AUTUMN_PAID_PLAN_FEATURE_ID,
  });

  return result.allowed;
}

export async function customerHasManagedAccess(customerId: string) {
  const result = await autumn.check({
    customerId,
    featureId: AUTUMN_MANAGED_ACCESS_FEATURE_ID,
  });

  return result.allowed;
}

// Remaining shared usage credits — the monthly `usage_credits` balance plus the
// rolled-over `topup_credits` balance. Both DataForSEO and LLM spend draw from
// these (the `seo_data_usage` and `llm_usage` features both map into them).
async function getUsageCreditsRemaining(customerId: string): Promise<{
  monthlyRemaining: number;
  topupRemaining: number;
}> {
  const [monthlyCheck, topupCheck] = await Promise.all([
    autumn.check({ customerId, featureId: AUTUMN_SEO_DATA_BALANCE_FEATURE_ID }),
    autumn.check({
      customerId,
      featureId: AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
    }),
  ]);

  // Every hosted org holds the monthly feature (the free plan is the Autumn
  // default, attached at customer creation), so a check with no balance data
  // is a broken read, not an empty wallet. Throwing keeps it out of the
  // credit math — coercing it to 0 once locked a paying customer with ~9k
  // credits out of chat (2026-07-20). The topup balance genuinely doesn't
  // exist until a first top-up, so 0 is the honest reading there.
  if (!monthlyCheck.balance) {
    throw new AppError(
      "UPSTREAM_UNAVAILABLE",
      `Autumn check returned no ${AUTUMN_SEO_DATA_BALANCE_FEATURE_ID} balance for customer ${customerId}`,
    );
  }

  return {
    monthlyRemaining: monthlyCheck.balance.remaining,
    topupRemaining: topupCheck.balance?.remaining ?? 0,
  };
}

/**
 * Depletion check for the chat-agent gates. A /check reading ≤ 0 is not
 * trusted on its own: Autumn has served a stale balance transiently
 * (2026-07-20, minutes after a customer's free→paid upgrade), and a false
 * refusal locks the customer out of chat. When the check reads depleted,
 * confirm against the full customer object — a separate Autumn read path —
 * and refuse only when both agree. A disagreement means Autumn served
 * inconsistent balances: the turn proceeds on the confirmed reading and the
 * inconsistency is logged at error level so it lands in Workers error
 * tracking, not buried in analytics. Confirmed refusals emit a PostHog event (paywall
 * analytics — refusals used to be invisible everywhere).
 */
export async function checkUsageCreditsDepleted(
  customer: BillingCustomerContext,
): Promise<{ depleted: boolean; monthlyRemaining: number }> {
  const check = await getUsageCreditsRemaining(customer.organizationId);
  if (check.monthlyRemaining + check.topupRemaining > 0) {
    return { depleted: false, monthlyRemaining: check.monthlyRemaining };
  }

  // No try/catch: if this second read fails while the first said depleted,
  // the whole gate errors rather than guessing — the turn fails generically
  // and retryably instead of refusing with a possibly-false paywall.
  const full = await autumn.customers.getOrCreate({
    customerId: customer.organizationId,
    email: customer.userEmail,
  });
  const confirmed = {
    monthlyRemaining:
      full.balances[AUTUMN_SEO_DATA_BALANCE_FEATURE_ID]?.remaining ?? 0,
    topupRemaining:
      full.balances[AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID]?.remaining ?? 0,
  };

  if (confirmed.monthlyRemaining + confirmed.topupRemaining > 0) {
    console.error(
      "billing.credits-gate disagreement: /check read depleted but the " +
        "customer object shows credits; proceeding on the customer reading",
      {
        organizationId: customer.organizationId,
        check,
        confirmed,
      },
    );
    return { depleted: false, monthlyRemaining: confirmed.monthlyRemaining };
  }

  await captureServerEvent({
    distinctId: customer.userId,
    event: "usage:credits_gate_refused",
    organizationId: customer.organizationId,
    properties: {
      project_id: customer.projectId,
      monthly_remaining: confirmed.monthlyRemaining,
      topup_remaining: confirmed.topupRemaining,
    },
  });
  return { depleted: true, monthlyRemaining: check.monthlyRemaining };
}

/**
 * Throws INSUFFICIENT_CREDITS when the org has no usage/topup credits left.
 * Returns the monthly remaining so a caller can split spend monthly-first.
 */
export async function assertUsageCreditsAvailable(
  customerId: string,
): Promise<{ monthlyRemaining: number }> {
  const { monthlyRemaining, topupRemaining } =
    await getUsageCreditsRemaining(customerId);

  if (monthlyRemaining + topupRemaining <= 0) {
    throw new AppError("INSUFFICIENT_CREDITS");
  }

  return { monthlyRemaining };
}

/**
 * Deducts a USD provider cost from the org's shared usage-credit pool: applies
 * the platform markup, converts to credits, spends monthly `usage_credits`
 * first then `topup_credits`, and emits the usage:credits_consume event. Both
 * DataForSEO and onboarding-LLM spend route through here, so they draw from the
 * one pool. Pass `monthlyRemaining` from the balance check that gated the call.
 */
export async function trackUsageCreditSpend(args: {
  customer: BillingCustomerContext;
  customerId: string;
  creditFeature: CreditFeature;
  costUsd: number;
  monthlyRemaining: number;
  properties?: Record<string, unknown>;
}): Promise<void> {
  const totalCostUsd = roundUsdForBilling(args.costUsd * SEO_DATA_COST_MARKUP);
  const totalCostCredits = Math.ceil(
    totalCostUsd * AUTUMN_SEO_DATA_CREDITS_PER_USD,
  );
  if (totalCostCredits <= 0) return;

  // Clamp at 0: Autumn balances can read negative after an overdraft, and a
  // negative monthly reading here would inflate the topup deduction.
  const monthlyDeduct = Math.min(
    Math.max(args.monthlyRemaining, 0),
    totalCostCredits,
  );
  const topupDeduct = totalCostCredits - monthlyDeduct;

  const properties = {
    currency: "USD",
    creditFeature: args.creditFeature,
    totalCostUsd,
    totalCostCredits,
    ...args.properties,
  };

  if (monthlyDeduct > 0) {
    await autumn.track(
      {
        customerId: args.customerId,
        featureId: AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
        value: monthlyDeduct,
        properties: {
          ...properties,
          balanceFeatureId: AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
        },
      },
      AUTUMN_TRACK_RETRY_OPTIONS,
    );
  }

  if (topupDeduct > 0) {
    await autumn.track(
      {
        customerId: args.customerId,
        featureId: AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
        value: topupDeduct,
        properties: {
          ...properties,
          balanceFeatureId: AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
        },
      },
      AUTUMN_TRACK_RETRY_OPTIONS,
    );
  }

  await captureServerEvent({
    distinctId: args.customer.userId,
    event: "usage:credits_consume",
    organizationId: args.customer.organizationId,
    properties: {
      project_id: args.customer.projectId,
      credit_feature: args.creditFeature,
      monthly_credits: monthlyDeduct,
      topup_credits: topupDeduct,
      total_credits: totalCostCredits,
      cost_usd: totalCostUsd,
    },
  });
}
