import { queryOptions } from "@tanstack/react-query";
import { billingAccountQueryOptions } from "@/client/features/billing/billingAccountQuery";
import { organizationContextQueryOptions } from "@/client/features/team/organizationQueries";
import { captureClientEvent } from "@/client/lib/posthog";
import { queryClient } from "@/client/tanstack-db";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { hasOrgPermission } from "@/lib/org-permissions";
import { createPlanCheckout } from "@/serverFunctions/billing";
import { AUTUMN_PAID_PLAN_ID, type CheckoutPlanId } from "@/shared/billing";

const planCheckoutQueryOptions = (planId: CheckoutPlanId, redirectTo: string) =>
  queryOptions({
    queryKey: ["billing", "checkout-url", planId, redirectTo],
    queryFn: () => createPlanCheckout({ data: { planId, redirectTo } }),
    // Autumn's checkout sessions last an hour; start over after 10 minutes.
    staleTime: 10 * 60_000,
    gcTime: 10 * 60_000,
    retry: false,
  });

// Autumn keeps one open Stripe checkout per customer and expires it when a
// checkout with different details is requested. Every upgrade link returns to
// the app home, so the paywall, Billing and other tabs all get the same live
// session back instead of cancelling each other's.
const UPGRADE_REDIRECT = "/";

/**
 * Starts creating the upgrade checkout link before the click, since Autumn
 * takes a few seconds to make one. Nothing is billed until the customer
 * confirms at checkout, so an unused link only costs the call; skip orgs that
 * can't use it.
 */
export function prefetchUpgradeCheckout() {
  if (!isHostedClientAuthMode()) return;
  void Promise.all([
    queryClient.ensureQueryData(billingAccountQueryOptions()),
    queryClient.ensureQueryData(organizationContextQueryOptions()),
  ])
    .then(([account, organization]) => {
      if (
        account.planStatus !== "free" ||
        !hasOrgPermission(organization.role, { billing: ["manage"] })
      ) {
        return;
      }
      return queryClient.prefetchQuery(
        planCheckoutQueryOptions(AUTUMN_PAID_PLAN_ID, UPGRADE_REDIRECT),
      );
    })
    // The click creates the link itself if this didn't.
    .catch(() => undefined);
}

/** Sends the browser to checkout, using the link made ahead of time if any. */
export async function openPlanCheckout(
  planId: CheckoutPlanId,
  redirectTo: string,
) {
  const options = planCheckoutQueryOptions(planId, redirectTo);
  captureClientEvent("billing:checkout_start", {
    planId,
    link_ready: queryClient.getQueryData(options.queryKey) !== undefined,
  });
  window.location.assign(await queryClient.fetchQuery(options));
}

export function openUpgradeCheckout() {
  return openPlanCheckout(AUTUMN_PAID_PLAN_ID, UPGRADE_REDIRECT);
}
