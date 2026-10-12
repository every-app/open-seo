import {
  AUTUMN_MANAGED_ACCESS_FEATURE_ID,
  AUTUMN_PAID_PLAN_FEATURE_ID,
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
  autumnSeoDataCreditsToUsd,
  type PlanStatus,
} from "@/shared/billing";
import { autumn } from "@/server/billing/autumn";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { AppError } from "@/server/lib/errors";

/** The organization's plan and credits, as the billing screens show them. */
type BillingAccount = {
  planStatus: PlanStatus;
  /** The plan that granted the paid entitlement. Null on the free plan and
   *  for paid access granted by hand. */
  paidPlanId: string | null;
  /** What the plan grants each month, in USD. */
  monthlyCreditsUsd: number;
  monthlyRemainingUsd: number;
  topUpRemainingUsd: number;
  hasManagedAccess: boolean;
  isPastDue: boolean;
  /** When the monthly credits refill, in epoch ms. Null for the free plan's
   *  one-time credits and for a paid plan canceled at period end, which ends
   *  then instead of refilling. */
  monthlyRefillsAt: number | null;
};

export async function getOrganizationBillingAccount(
  context: BillingCustomerContext,
): Promise<BillingAccount> {
  // No expand: every field read below is on the bare customer.
  const customer = await autumn.customers.getOrCreate({
    customerId: context.organizationId,
    email: context.userEmail,
  });

  // The SDK fails open on Autumn 5xx and network errors with an empty customer
  // that has no id. Showing it would tell a paying customer they are on the
  // free plan with $0, so surface the outage instead.
  if (!customer.id) {
    console.warn("billing.account: Autumn returned no customer", {
      organizationId: context.organizationId,
    });
    throw new AppError(
      "UPSTREAM_UNAVAILABLE",
      "Autumn returned no billing customer",
    );
  }

  const paidFlag = customer.flags[AUTUMN_PAID_PLAN_FEATURE_ID];
  const paidSubscription = customer.subscriptions.find(
    (s) => s.planId === paidFlag?.planId,
  );
  const monthly = customer.balances[AUTUMN_SEO_DATA_BALANCE_FEATURE_ID];
  const topUp = customer.balances[AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID];

  return {
    // Autumn names the plan that granted `paid_plan`, so every plan configured
    // to grant it counts as paid without listing plan IDs here.
    planStatus: paidFlag ? "paid" : "free",
    paidPlanId: paidFlag?.planId ?? null,
    monthlyCreditsUsd: autumnSeoDataCreditsToUsd(monthly?.granted ?? 0),
    monthlyRemainingUsd: autumnSeoDataCreditsToUsd(monthly?.remaining ?? 0),
    topUpRemainingUsd: autumnSeoDataCreditsToUsd(topUp?.remaining ?? 0),
    hasManagedAccess: Boolean(customer.flags[AUTUMN_MANAGED_ACCESS_FEATURE_ID]),
    isPastDue: customer.subscriptions.some((s) => s.pastDue),
    monthlyRefillsAt: paidSubscription?.canceledAt
      ? null
      : (monthly?.nextResetAt ?? null),
  };
}
