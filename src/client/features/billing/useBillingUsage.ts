import { queryOptions, useQuery } from "@tanstack/react-query";
import { getBillingUsage } from "@/serverFunctions/billing";

export const billingUsageQueryOptions = () => {
  // Days are binned in the viewer's timezone.
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return queryOptions({
    queryKey: ["billing", "usage", "30d", timezone],
    queryFn: () => getBillingUsage({ data: { timezone } }),
    staleTime: 60_000,
  });
};

/** The last 30 days of usage, by day for the usage chart and by feature for the breakdown. */
export function useBillingUsage() {
  return useQuery(billingUsageQueryOptions());
}
