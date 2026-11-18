import { useQuery } from "@tanstack/react-query";
import { billingAccountQueryOptions } from "@/client/features/billing/billingAccountQuery";
import {
  AUTO_RELOAD_CARD_FAILURE_REASONS,
  isAutoReloadBudgetSpent,
  LOW_CREDITS_THRESHOLD_USD,
} from "@/shared/billing";

/** The signed-in organization's plan and remaining credits in USD. */
export function useCreditBalance() {
  const accountQuery = useQuery(billingAccountQueryOptions());
  const account = accountQuery.data;

  const monthlyRemaining = account?.monthlyRemainingUsd ?? 0;
  const topUpRemaining = account?.topUpRemainingUsd ?? 0;
  const totalRemaining = monthlyRemaining + topUpRemaining;
  const isOutOfCredits = totalRemaining <= 0;

  // Whether auto-reload will bring credits: "on" means the next low balance
  // buys more, the others say why it will not. "card_failed" is the
  // customer's to fix; "failed" is ours; "budget_spent" pauses top-up
  // credits until the budget is raised or the cycle resets.
  const autoReload = account?.autoReload ?? null;
  const autoReloadState:
    | "off"
    | "on"
    | "card_failed"
    | "failed"
    | "budget_spent" = !autoReload?.enabled
    ? "off"
    : autoReload.failure
      ? AUTO_RELOAD_CARD_FAILURE_REASONS.has(autoReload.failure.reason)
        ? "card_failed"
        : "failed"
      : isAutoReloadBudgetSpent(autoReload.spentUsd, autoReload.monthlyLimitUsd)
        ? "budget_spent"
        : "on";
  // Top-up credits pay once the monthly credits are gone, so a spent budget
  // only stops work then.
  const isPausedByBudget =
    autoReloadState === "budget_spent" && monthlyRemaining <= 0;

  return {
    accountQuery,
    isFreePlan: account?.planStatus !== "paid",
    monthlyRemaining,
    topUpRemaining,
    totalRemaining,
    isOutOfCredits,
    // Running low is expected while auto-reload is about to buy more.
    isLowCredits:
      !isOutOfCredits &&
      totalRemaining < LOW_CREDITS_THRESHOLD_USD &&
      autoReloadState !== "on",
    autoReload,
    autoReloadState,
    isPausedByBudget,
    autoReloadPrimesOnEnable: account?.autoReloadPrimesOnEnable ?? false,
    // When monthly credits refill, e.g. "Oct 12".
    refillDate: account?.monthlyRefillsAt
      ? new Date(account.monthlyRefillsAt).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        })
      : null,
  };
}
