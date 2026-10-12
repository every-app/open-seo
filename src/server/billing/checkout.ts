import { normalizeAuthRedirect } from "@/lib/auth-redirect";
import type { EnsuredUserContext } from "@/middleware/ensure-user/types";
import { requireOrgPermission } from "@/server/auth/org-gate";
import { autumn } from "@/server/billing/autumn";
import { AppError } from "@/server/lib/errors";
import {
  AUTUMN_CHECKOUT_SESSION_PARAMS,
  AUTUMN_PAID_PLAN_ID,
  AUTUMN_SEO_DATA_CREDITS_PER_USD,
  AUTUMN_SEO_DATA_TOP_UP_PLAN_ID,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
  AUTUMN_YC_CHECKOUT_SESSION_PARAMS,
  AUTUMN_YC_PLAN_ID,
  BILLING_ROUTE,
  SUBSCRIBE_ROUTE,
  type CheckoutPlanId,
} from "@/shared/billing";

type BillingCaller = Pick<EnsuredUserContext, "organizationId" | "role">;

// The Stripe Checkout options each plan sells with.
const PLAN_CHECKOUT_SESSION_PARAMS: Record<
  CheckoutPlanId,
  Record<string, unknown>
> = {
  [AUTUMN_PAID_PLAN_ID]: AUTUMN_CHECKOUT_SESSION_PARAMS,
  [AUTUMN_YC_PLAN_ID]: AUTUMN_YC_CHECKOUT_SESSION_PARAMS,
};

// redirectMode "always" makes Autumn return a link instead of billing: Stripe
// Checkout, or Autumn's own confirmation page for a customer who already
// subscribes. Nothing is charged until the customer confirms there, which is
// what makes it safe to create these links before the click.
async function createCheckoutUrl(
  caller: BillingCaller,
  params: Omit<
    Parameters<typeof autumn.billing.attach>[0],
    "customerId" | "redirectMode"
  >,
) {
  requireOrgPermission(caller, { billing: ["manage"] });
  const { paymentUrl } = await autumn.billing.attach({
    ...params,
    customerId: caller.organizationId,
    redirectMode: "always",
  });
  if (!paymentUrl) {
    throw new AppError("INTERNAL_ERROR", "Autumn returned no checkout link");
  }
  return paymentUrl;
}

export function createPlanCheckoutUrl(
  caller: BillingCaller,
  args: { planId: CheckoutPlanId; redirectTo: string; origin: string },
) {
  // /subscribe waits for Autumn to show the new plan, then forwards to
  // redirectTo.
  const successUrl = new URL(SUBSCRIBE_ROUTE, args.origin);
  successUrl.searchParams.set("checkout", "success");
  successUrl.searchParams.set(
    "redirect",
    normalizeAuthRedirect(args.redirectTo),
  );

  return createCheckoutUrl(caller, {
    planId: args.planId,
    successUrl: successUrl.href,
    checkoutSessionParams: PLAN_CHECKOUT_SESSION_PARAMS[args.planId],
  });
}

export function createTopUpCheckoutUrl(
  caller: BillingCaller,
  args: { amountUsd: number; origin: string },
) {
  return createCheckoutUrl(caller, {
    planId: AUTUMN_SEO_DATA_TOP_UP_PLAN_ID,
    successUrl: new URL(BILLING_ROUTE, args.origin).href,
    checkoutSessionParams: AUTUMN_CHECKOUT_SESSION_PARAMS,
    featureQuantities: [
      {
        featureId: AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
        quantity: args.amountUsd * AUTUMN_SEO_DATA_CREDITS_PER_USD,
      },
    ],
  });
}

export async function createBillingPortalUrl(
  caller: BillingCaller,
  args: { returnTo: string; origin: string },
) {
  requireOrgPermission(caller, { billing: ["manage"] });
  const { url } = await autumn.billing.openCustomerPortal({
    customerId: caller.organizationId,
    returnUrl: new URL(normalizeAuthRedirect(args.returnTo), args.origin).href,
  });
  return url;
}
