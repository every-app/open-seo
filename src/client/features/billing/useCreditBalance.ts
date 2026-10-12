import { useQuery } from "@tanstack/react-query";
import { billingAccountQueryOptions } from "@/client/features/billing/billingAccountQuery";
import { LOW_CREDITS_THRESHOLD_USD } from "@/shared/billing";

/** The signed-in organization's plan and remaining credits in USD. */
export function useCreditBalance() {
  const accountQuery = useQuery(billingAccountQueryOptions());
  const account = accountQuery.data;

  const monthlyRemaining = account?.monthlyRemainingUsd ?? 0;
  const topUpRemaining = account?.topUpRemainingUsd ?? 0;
  const totalRemaining = monthlyRemaining + topUpRemaining;
  const isOutOfCredits = totalRemaining <= 0;

  return {
    accountQuery,
    isFreePlan: account?.planStatus !== "paid",
    monthlyRemaining,
    topUpRemaining,
    totalRemaining,
    isOutOfCredits,
    isLowCredits: !isOutOfCredits && totalRemaining < LOW_CREDITS_THRESHOLD_USD,
    // When monthly credits refill, e.g. "Oct 12".
    refillDate: account?.monthlyRefillsAt
      ? new Date(account.monthlyRefillsAt).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        })
      : null,
  };
}
