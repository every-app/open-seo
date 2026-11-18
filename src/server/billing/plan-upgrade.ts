import type { EnsuredUserContext } from "@/middleware/ensure-user/types";
import { requireOrgPermission } from "@/server/auth/org-gate";
import {
  autumn,
  AUTUMN_TRACK_RETRY_OPTIONS,
  isNoAnswerError,
} from "@/server/billing/autumn";
import { AppError } from "@/server/lib/errors";
import { captureServerError } from "@/server/lib/posthog";
import {
  AUTUMN_PAID_PLAN_FEATURE_ID,
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  autumnSeoDataCreditsToUsd,
  BILLING_ROUTE,
  canUpgradePlan,
  type CheckoutPlanId,
} from "@/shared/billing";

/**
 * Self-serve upgrades to a pricier monthly plan. Credits are what a plan
 * sells, so an upgrade is prorated by credits rather than days: it starts a
 * new monthly cycle today at the new plan's full price, with no refund for
 * the old plan's unused days, and the credits left from the old plan carry
 * over until the new cycle's refill. Autumn's default would charge only the
 * rest of the month and still grant the whole allowance, selling a month of
 * the bigger plan's credits for a day's price at the end of a cycle.
 */

type BillingCaller = Pick<EnsuredUserContext, "organizationId" | "role">;

const upgradeParams = (customerId: string, planId: CheckoutPlanId) => ({
  customerId,
  planId,
  billingCycleAnchor: "now",
  prorationBehavior: "none" as const,
  carryOverBalances: {
    enabled: true,
    featureIds: [AUTUMN_SEO_DATA_BALANCE_FEATURE_ID],
  },
});

async function requireUpgrade(caller: BillingCaller, planId: CheckoutPlanId) {
  requireOrgPermission(caller, { billing: ["manage"] });
  const customer = await autumn.customers.get({
    customerId: caller.organizationId,
  });
  const currentPlanId =
    customer.flags[AUTUMN_PAID_PLAN_FEATURE_ID]?.planId ?? null;
  if (!canUpgradePlan(currentPlanId, planId)) {
    throw new AppError(
      "VALIDATION_ERROR",
      `${currentPlanId ?? "The free plan"} can't move to ${planId} in the app`,
    );
  }
  // The failed renewal is settled first; the page points at the card.
  if (customer.subscriptions.some((s) => s.pastDue)) {
    throw new AppError(
      "PAYMENT_METHOD_REQUIRED",
      `${caller.organizationId} is past due`,
    );
  }
  return customer;
}

/** What the upgrade charges today, the credits it carries over, and when
 *  and for how much the new plan renews. */
export async function previewOrganizationPlanUpgrade(
  caller: BillingCaller,
  { planId }: { planId: CheckoutPlanId },
) {
  const customer = await requireUpgrade(caller, planId);
  const preview = await autumn.billing.previewAttach(
    upgradeParams(caller.organizationId, planId),
  );
  if (!preview.nextCycle) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Autumn previewed the upgrade without a renewal",
    );
  }
  return {
    chargeUsd: preview.total,
    carriedUsd: autumnSeoDataCreditsToUsd(
      customer.balances[AUTUMN_SEO_DATA_BALANCE_FEATURE_ID]?.remaining ?? 0,
    ),
    renewsAt: preview.nextCycle.startsAt,
    renewalUsd: preview.nextCycle.total,
  };
}

/** Charges the saved card and moves the organization to the new plan. Returns
 *  a payment link only when the bank asks the customer to confirm. */
export async function upgradeOrganizationPlan(
  caller: BillingCaller,
  { planId, origin }: { planId: CheckoutPlanId; origin: string },
): Promise<{ paymentUrl: string | null }> {
  await requireUpgrade(caller, planId);
  const customerId = caller.organizationId;

  let result;
  try {
    result = await autumn.billing.attach(
      {
        ...upgradeParams(customerId, planId),
        redirectMode: "if_required",
        successUrl: new URL(BILLING_ROUTE, origin).href,
      },
      // A charge has no idempotency key, so the SDK's default retry on a 5xx
      // or dropped connection after Autumn charged the card would charge it
      // again.
      AUTUMN_TRACK_RETRY_OPTIONS,
    );
  } catch (error) {
    // No answer is not no charge: the page asks them to check their plan
    // before trying again. Logged because the code is not reported.
    if (isNoAnswerError(error)) {
      console.error("[billing] plan upgrade got no answer", {
        customerId,
        planId,
        error,
      });
      throw new AppError("PAYMENT_ACTION_REQUIRED", error.message);
    }
    throw error;
  }

  if (result.paymentUrl) return { paymentUrl: result.paymentUrl };
  if (result.requiredAction) {
    throw new AppError(
      result.requiredAction.code === "payment_processing"
        ? "PAYMENT_ACTION_REQUIRED"
        : "PAYMENT_METHOD_REQUIRED",
      `Plan upgrade needs ${result.requiredAction.code}: ${result.requiredAction.reason}`,
    );
  }

  await keepCarriedCreditsUntilRenewal(customerId);
  return { paymentUrl: null };
}

// Autumn keeps carried-over credits until the old plan's refill date. Moving
// them to the new plan's refill gives the customer one date for everything
// they have. The card is charged by now, so a failure is reported, not
// thrown: the credits are still there, they just end at the old date.
async function keepCarriedCreditsUntilRenewal(customerId: string) {
  try {
    const customer = await autumn.customers.get({ customerId });
    const balance = customer.balances[AUTUMN_SEO_DATA_BALANCE_FEATURE_ID];
    if (!balance?.nextResetAt) {
      throw new Error("The upgraded plan's credits have no refill date");
    }
    const renewsAt = balance.nextResetAt;
    // Only credits still live: moving an expired grant would revive it.
    const now = Date.now();
    const carried = (balance.breakdown ?? []).filter(
      (part) =>
        part.planId === null &&
        part.expiresAt !== null &&
        part.expiresAt > now &&
        part.expiresAt < renewsAt,
    );
    for (const part of carried) {
      await autumn.balances.update({
        customerId,
        featureId: AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
        balanceId: part.id,
        expiresAt: renewsAt,
      });
    }
  } catch (error) {
    console.error("[billing] carried-over credits kept the old refill date", {
      customerId,
      error,
    });
    await captureServerError(
      error,
      { source: "plan_upgrade", customer_id: customerId },
      customerId,
    );
  }
}
