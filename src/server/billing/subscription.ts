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
  if (await env.KV.get(cacheKey)) {
    return { id: context.organizationId };
  }

  const customer = await autumn.customers.getOrCreate({
    customerId: context.organizationId,
    email: context.userEmail,
  });

  if (!customer.id) {
    throw new AppError("INTERNAL_ERROR", "Failed to resolve billing customer");
  }

  await env.KV.put(cacheKey, "1", {
    expirationTtl: CUSTOMER_ENSURED_TTL_SECONDS,
  });

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
export async function getUsageCreditsRemaining(customerId: string): Promise<{
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

  return {
    monthlyRemaining: monthlyCheck.balance?.remaining ?? 0,
    topupRemaining: topupCheck.balance?.remaining ?? 0,
  };
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

  const monthlyDeduct = Math.min(args.monthlyRemaining, totalCostCredits);
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
