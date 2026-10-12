import { queryOptions } from "@tanstack/react-query";
import { queryClient } from "@/client/tanstack-db";
import { isHostedClientAuthMode } from "@/lib/auth-mode";

/**
 * The organization's plan and credits. Every billing surface reads this one
 * query, so a page opened from anywhere in the app renders from the cache.
 */
export const billingAccountQueryOptions = () =>
  queryOptions({
    queryKey: ["billing", "account"],
    // Imported when the query runs: QueryState's out-of-credits message reads
    // this query on every page, and a static import would pull the server
    // function's middleware into every module (and test) that renders it.
    queryFn: async () => {
      const { getBillingAccount } = await import("@/serverFunctions/billing");
      return getBillingAccount();
    },
    // Balances move with every paid call.
    staleTime: 60_000,
    // The SDK doesn't retry Autumn errors on this read (it fails open and the
    // server turns that into an error), so try once more here.
    retry: 1,
  });

/** Starts loading the billing account without waiting for it. Hosted only. */
export function prefetchBillingAccount() {
  if (!isHostedClientAuthMode()) return;
  void queryClient.prefetchQuery(billingAccountQueryOptions());
}
