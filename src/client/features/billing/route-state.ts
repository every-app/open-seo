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
  finalizingTimedOut: boolean;
}) {
  if (!args.hasSession || args.isCustomerLoading) {
    return "loading" as const;
  }

  // Hard stop for the post-checkout wait: once the finalizing window runs
  // out, let the user through even if the last poll errored — entitlements
  // are enforced server-side, so the worst case is briefly-stale free-plan
  // UI, not a paid user stranded on a spinner or an error screen.
  if (args.checkoutCompleted && args.finalizingTimedOut) {
    return "redirectToApp" as const;
  }

  if (args.isCustomerError) {
    return "error" as const;
  }

  if (args.planStatus === "paid") {
    return "redirectToApp" as const;
  }

  // Back from Stripe but Autumn hasn't reflected the subscription yet — poll
  // instead of showing the paywall again (whose only CTA is paying twice).
  // This must win over the managed-access redirect below: free-plan customers
  // have managed access too, so checking it first would bounce a just-paid
  // user into the app still marked as free.
  if (args.checkoutCompleted) {
    return "finalizing" as const;
  }

  // Free-plan users landing here outside the upgrade flow belong in the app,
  // not on the paywall.
  if (args.hasManagedAccess && !args.isUpgradeFlow) {
    return "redirectToApp" as const;
  }

  return "showPaywall" as const;
}
