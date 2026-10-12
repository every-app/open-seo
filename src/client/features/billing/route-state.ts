import type { PlanStatus } from "@/shared/billing";

export function getSubscribeRouteState(args: {
  isCustomerLoading: boolean;
  isCustomerError: boolean;
  hasCustomerData: boolean;
  hasManagedAccess: boolean;
  planStatus: PlanStatus;
  isUpgradeFlow: boolean;
  checkoutCompleted: boolean;
  finalizingTimedOut: boolean;
}) {
  if (args.isCustomerLoading) {
    return "loading" as const;
  }

  // Hard stop for the post-checkout wait: once the finalizing window runs
  // out, let the user through even if the last poll errored — entitlements
  // are enforced server-side, so the worst case is briefly-stale free-plan
  // UI, not a paid user stranded on a spinner or an error screen.
  if (args.checkoutCompleted && args.finalizingTimedOut) {
    return "redirectToApp" as const;
  }

  // A failed poll while finalizing keeps polling: the error screen would stop
  // the poll and park a just-paid user on "Billing unavailable". A failed
  // refetch with the customer already loaded keeps the paywall, since every
  // Upgrade button in the app lands here.
  if (
    args.isCustomerError &&
    !args.checkoutCompleted &&
    !args.hasCustomerData
  ) {
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
