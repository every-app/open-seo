import { queryOptions, useQuery } from "@tanstack/react-query";
import { getBillingUsageEvents } from "@/serverFunctions/billing";

export const BILLING_USAGE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export const billingUsageEventsQueryOptions = () =>
  queryOptions({
    queryKey: ["billing", "usage-events", `${BILLING_USAGE_DAYS}d`],
    queryFn: () => {
      const end = Date.now();
      return getBillingUsageEvents({
        data: { start: end - BILLING_USAGE_DAYS * DAY_MS, end },
      });
    },
    staleTime: 60_000,
  });

/** The usage events of the last 30 days, for the usage chart and the per-feature breakdown. */
export function useBillingUsageEvents() {
  return useQuery(billingUsageEventsQueryOptions());
}
