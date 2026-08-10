import { SUBSCRIBE_ROUTE } from "@/shared/billing";

// Success URL for plan checkouts: land on /subscribe's finalizing screen,
// which polls until Autumn reflects the new subscription, then forwards to
// redirectTo.
export function buildCheckoutSuccessUrl(redirectTo: string) {
  const url = new URL(SUBSCRIBE_ROUTE, window.location.origin);
  url.searchParams.set("checkout", "success");
  url.searchParams.set("redirect", redirectTo);
  return url.toString();
}
