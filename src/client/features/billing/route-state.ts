import type { PlanStatus } from "@/client/features/billing/plan-detection";

export function getBillingRouteState(args: {
  hasSession: boolean;
  isSessionPending: boolean;
  isCustomerLoading: boolean;
  isCustomerError: boolean;
}) {
  if (args.isSessionPending || !args.hasSession || args.isCustomerLoading) {
    return "loading" as const;
  }

  if (args.isCustomerError) {
    return "error" as const;
  }

  return "ready" as const;
}

export function getSubscribeRouteState(args: {
  hasSession: boolean;
  isCustomerLoading: boolean;
  isCustomerError: boolean;
  hasManagedAccess: boolean;
  planStatus: PlanStatus;
  isUpgradeFlow: boolean;
  checkoutCompleted: boolean;
}) {
  if (!args.hasSession || args.isCustomerLoading) {
    return "loading" as const;
  }

  if (args.isCustomerError) {
    return "error" as const;
  }

  if (args.planStatus === "paid") {
    return "redirectToApp" as const;
  }

  // Free-plan users landing here outside the upgrade flow belong in the app,
  // not on the paywall.
  if (args.hasManagedAccess && !args.isUpgradeFlow) {
    return "redirectToApp" as const;
  }

  // Back from Stripe but Autumn hasn't reflected the subscription yet — poll
  // instead of showing the paywall again (whose only CTA is paying twice).
  if (args.checkoutCompleted) {
    return "finalizing" as const;
  }

  return "showPaywall" as const;
}
