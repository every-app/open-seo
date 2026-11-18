import type { autumn } from "@/server/billing/autumn";
import { z } from "zod";
import {
  AUTO_RELOAD_DEFAULTS,
  AUTO_RELOAD_THRESHOLD_USD,
  AUTUMN_SEO_DATA_CREDITS_PER_USD,
  AUTUMN_SEO_DATA_TOP_UP_PLAN_ID,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
  autumnSeoDataCreditsToUsd,
  type AutoReloadSettings,
} from "@/shared/billing";

// Leaf module (no runtime imports beyond zod) so the billing account read,
// which every page makes, does not load the email and database modules the
// auto-reload service needs.

type AutumnCustomer = Awaited<ReturnType<typeof autumn.customers.get>>;

export type AutoReloadStatus = AutoReloadSettings & {
  enabled: boolean;
  /** The top-up balance at or below which Autumn reloads. Fixed by the app,
   *  read back from Autumn. */
  thresholdUsd: number;
  /** Top-up credits spent so far this billing cycle, in USD, as Autumn
   *  counts them against the budget. Open holds count; the cycle resets
   *  with the monthly credits. */
  spentUsd: number;
  /** The last reload Autumn could not charge, until one succeeds or the
   *  settings are saved again. */
  failure: { reason: string; at: number } | null;
};

// The failure webhook writes this to the Autumn customer's metadata and the
// success webhook (or the next save) clears it, so the billing page can say
// why credits stopped arriving without a table of our own. Metadata updates
// merge by key, and a null value deletes the key.
export const AUTO_RELOAD_FAILURE_METADATA_KEY = "autoReloadFailure";
const autoReloadFailureSchema = z.object({
  reason: z.string(),
  at: z.number(),
});

/** The customer's auto-reload control as the billing page shows it. Null
 *  when it has never been set up. */
export function readAutoReload(
  customer: AutumnCustomer,
): AutoReloadStatus | null {
  const control = customer.billingControls?.autoTopups?.find(
    (entry) => entry.featureId === AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
  );
  if (!control) return null;

  // The budget is Autumn's usage limit on the same balance, written together
  // with the control, so it is only missing on a customer set up before it.
  const budget = customer.billingControls?.usageLimits?.find(
    (entry) => entry.featureId === AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
  );
  const failure = autoReloadFailureSchema.safeParse(
    customer.metadata?.[AUTO_RELOAD_FAILURE_METADATA_KEY],
  );

  return {
    enabled: control.enabled,
    thresholdUsd: autumnSeoDataCreditsToUsd(control.threshold),
    amountUsd: autumnSeoDataCreditsToUsd(control.quantity),
    monthlyLimitUsd: budget
      ? autumnSeoDataCreditsToUsd(budget.limit)
      : AUTO_RELOAD_DEFAULTS.monthlyLimitUsd,
    spentUsd: autumnSeoDataCreditsToUsd(budget?.usage ?? 0),
    failure: failure.success ? failure.data : null,
  };
}

/**
 * Whether turning auto-reload on buys the first reload right away, which the
 * page must say before the click. Autumn prices a reload from the
 * organization's own top-up purchase, so an organization without one gets
 * it now. Otherwise only when the top-up balance is already at or below the
 * threshold and Autumn would not buy on its own: it is off, or its last
 * reload failed (a successful charge is what lifts Autumn's pause on a
 * declining card). A balance above the threshold never buys now, so a retry
 * after a charge that landed cannot charge again.
 */
export function primesAutoReloadOnEnable(customer: AutumnCustomer) {
  const hasTopUpPurchase = customer.purchases.some(
    (purchase) => purchase.planId === AUTUMN_SEO_DATA_TOP_UP_PLAN_ID,
  );
  if (!hasTopUpPurchase) return true;
  const current = readAutoReload(customer);
  const topUpRemaining =
    customer.balances[AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID]?.remaining ?? 0;
  return (
    topUpRemaining <=
      AUTO_RELOAD_THRESHOLD_USD * AUTUMN_SEO_DATA_CREDITS_PER_USD &&
    (!current?.enabled || current.failure !== null)
  );
}
