/* eslint-disable max-lines -- the org billing seam: customer lookup, credit gates, and credit holds with their settlement */
import { env } from "cloudflare:workers";
import type { EnsuredUserContext } from "@/middleware/ensure-user/types";
import {
  AUTUMN_PAID_PLAN_FEATURE_ID,
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
  applyBillingMarkupUsd,
  creditsForProviderUsd,
} from "@/shared/billing";
import type { CreditFeature } from "@/shared/billing-credit-features";
import { autumn, AUTUMN_TRACK_RETRY_OPTIONS } from "@/server/billing/autumn";
import { captureServerEvent } from "@/server/lib/posthog";
import { AppError } from "@/server/lib/errors";

export type BillingCustomerContext = Pick<
  EnsuredUserContext,
  "organizationId" | "userEmail" | "userId"
> & {
  projectId?: string;
};

// Existence is monotonic and the Autumn customer id is always the org id we
// pass, so once we've confirmed a customer exists we can skip the round trip
// and reuse the org id. Callers only need `.id` (they read balances via
// `check`), and a degraded Autumn API otherwise added seconds to every hot-path
// request that ensured the customer (incident 2026-07-06). Long TTL is safe:
// we only ever cache confirmed existence, never absence.
const CUSTOMER_ENSURED_TTL_SECONDS = 24 * 60 * 60;
const customerEnsuredKey = (organizationId: string) =>
  `autumn:customer-ensured:${organizationId}`;

export async function getOrCreateOrganizationCustomer(
  context: BillingCustomerContext,
): Promise<{ id: string }> {
  const cacheKey = customerEnsuredKey(context.organizationId);
  try {
    if (await env.KV.get(cacheKey)) {
      return { id: context.organizationId };
    }
  } catch (error) {
    console.warn("billing.customer-cache-read failed:", error);
  }

  const customer = await autumn.customers.getOrCreate({
    customerId: context.organizationId,
    email: context.userEmail,
  });

  if (!customer.id) {
    throw new AppError("INTERNAL_ERROR", "Failed to resolve billing customer");
  }

  try {
    await env.KV.put(cacheKey, "1", {
      expirationTtl: CUSTOMER_ENSURED_TTL_SECONDS,
    });
  } catch (error) {
    console.warn("billing.customer-cache-write failed:", error);
  }

  return { id: customer.id };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function customerHasPaidPlan(
  customerId: string,
  opts: { retryDenied?: boolean } = {},
) {
  const result = await autumn.check({
    customerId,
    featureId: AUTUMN_PAID_PLAN_FEATURE_ID,
  });
  if (result.allowed || !opts.retryDenied) return result.allowed;

  // Autumn sometimes returns degraded entitlement data in a successful
  // response (see the balance retry in getUsageCreditsRemaining). Where a
  // false negative does lasting damage — the scheduler would advance a paying
  // org's schedule and flag "plan_required" — callers opt into one re-check.
  // Interactive deny paths skip it to stay fast for genuinely free users.
  await sleep(300);
  const retry = await autumn.check({
    customerId,
    featureId: AUTUMN_PAID_PLAN_FEATURE_ID,
  });
  return retry.allowed;
}

// Remaining shared usage credits — the monthly `usage_credits` balance plus the
// rolled-over `topup_credits` balance. Both DataForSEO and LLM spend draw from
// these (the `seo_data_usage` and `llm_usage` features both map into them).
export async function getUsageCreditsRemaining(customerId: string): Promise<{
  monthlyRemaining: number;
  topupRemaining: number;
}> {
  const [monthlyCheck, topupCheck] = await Promise.all([
    autumn.check({ customerId, featureId: AUTUMN_SEO_DATA_BALANCE_FEATURE_ID }),
    autumn.check({
      customerId,
      featureId: AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
    }),
  ]);

  // Autumn sometimes returns a successful response with no monthly balance
  // for a customer that holds the feature. Retry that read once because the
  // SDK's retry policy only covers failed HTTP requests.
  let monthlyBalance = monthlyCheck.balance;
  if (!monthlyBalance) {
    await sleep(300);
    const retry = await autumn.check({
      customerId,
      featureId: AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
    });
    monthlyBalance = retry.balance;
  }

  // Every hosted org holds the monthly feature (the free plan is the Autumn
  // default, attached at customer creation), so a check with no balance data
  // is a broken read, not an empty wallet. Throwing keeps it out of the
  // credit math — coercing it to 0 once locked a paying customer with ~9k
  // credits out of chat (2026-07-20). The topup balance genuinely doesn't
  // exist until a first top-up, so 0 is the honest reading there.
  if (!monthlyBalance) {
    // INTERNAL_ERROR, not UPSTREAM_UNAVAILABLE: this must stay reportable.
    throw new AppError(
      "INTERNAL_ERROR",
      `Autumn check returned no ${AUTUMN_SEO_DATA_BALANCE_FEATURE_ID} balance for customer ${customerId}`,
    );
  }

  // A missing optional top-up denies access; allowed with no balance is the
  // SDK's fail-open response, so the total is unknown rather than base-only.
  if (topupCheck.allowed && !topupCheck.balance) {
    throw new AppError(
      "INTERNAL_ERROR",
      `Autumn check returned no ${AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID} balance for customer ${customerId}`,
    );
  }

  return {
    monthlyRemaining: monthlyBalance.remaining,
    topupRemaining: topupCheck.balance?.remaining ?? 0,
  };
}

/**
 * Depletion check for the chat-agent gates. A /check reading ≤ 0 is not
 * trusted on its own: Autumn has served a stale balance transiently
 * (2026-07-20, minutes after a customer's free→paid upgrade), and a false
 * refusal locks the customer out of chat. When the check reads depleted,
 * confirm against the full customer object — a separate Autumn read path —
 * and refuse only when both agree. A disagreement means Autumn served
 * inconsistent balances: the turn proceeds on the confirmed reading and the
 * inconsistency is logged at error level so it lands in Workers error
 * tracking, not buried in analytics. Confirmed refusals emit a PostHog event (paywall
 * analytics — refusals used to be invisible everywhere).
 */
export async function checkUsageCreditsDepleted(
  customer: BillingCustomerContext,
): Promise<{ depleted: boolean; monthlyRemaining: number }> {
  const check = await getUsageCreditsRemaining(customer.organizationId);
  if (check.monthlyRemaining + check.topupRemaining > 0) {
    return { depleted: false, monthlyRemaining: check.monthlyRemaining };
  }

  // No try/catch: if this second read fails while the first said depleted,
  // the whole gate errors rather than guessing — the turn fails generically
  // and retryably instead of refusing with a possibly-false paywall.
  const full = await autumn.customers.getOrCreate({
    customerId: customer.organizationId,
    email: customer.userEmail,
  });
  const confirmed = {
    monthlyRemaining:
      full.balances[AUTUMN_SEO_DATA_BALANCE_FEATURE_ID]?.remaining ?? 0,
    topupRemaining:
      full.balances[AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID]?.remaining ?? 0,
  };

  if (confirmed.monthlyRemaining + confirmed.topupRemaining > 0) {
    console.error(
      "billing.credits-gate disagreement: /check read depleted but the " +
        "customer object shows credits; proceeding on the customer reading",
      {
        organizationId: customer.organizationId,
        check,
        confirmed,
      },
    );
    return { depleted: false, monthlyRemaining: confirmed.monthlyRemaining };
  }

  await captureServerEvent({
    distinctId: customer.userId,
    event: "usage:credits_gate_refused",
    organizationId: customer.organizationId,
    properties: {
      project_id: customer.projectId,
      monthly_remaining: confirmed.monthlyRemaining,
      topup_remaining: confirmed.topupRemaining,
    },
  });
  return { depleted: true, monthlyRemaining: check.monthlyRemaining };
}

// A hold outlives the provider call it covers; an orphaned hold (isolate
// death between check and finalize) releases at this TTL with no deduction.
const HOLD_TTL_MS = 30 * 60_000;

export type UsageCreditFeatureId =
  | typeof AUTUMN_SEO_DATA_BALANCE_FEATURE_ID
  | typeof AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID;

export type UsageCreditHold = {
  lockId: string;
  featureId: UsageCreditFeatureId;
  estimatedCredits: number;
  /** Indexes of the reserved provider calls this hold covers. */
  callIndexes: readonly number[];
};

/**
 * Atomically holds `credits` on one balance feature. Autumn refuses the hold
 * (allowed: false) when the balance is short, so concurrent calls cannot all
 * pass on the same reading the way a plain balance check lets them.
 *
 * The SDK fails open on a failed request (timeout, 5xx) with `allowed: true,
 * balance: null`, including one Autumn actually processed; that is a broken
 * read, not a wallet, so retry it once and then fail closed. The retry reuses
 * the lockId: a 409 `lock_already_exists` means the first hold landed (a
 * refusal creates no lock), so the call proceeds on it instead of stranding a
 * second hold for HOLD_TTL_MS. The SDK's own 5xx retry is off
 * (AUTUMN_TRACK_RETRY_OPTIONS): it would replay a lock Autumn already took
 * and throw that 409 from the first attempt, where nothing catches it. An
 * absent feature reads `allowed: false, balance: null` and is a genuine
 * refusal.
 */
export async function holdCredits(args: {
  customerId: string;
  featureId: UsageCreditFeatureId;
  estimatedCredits: number;
  callIndexes: readonly number[];
  properties: Record<string, unknown>;
  // A site audit's rendering hold must outlive the whole crawl, not one call.
  ttlMs?: number;
  lockPrefix?: string;
}) {
  const {
    customerId,
    featureId,
    estimatedCredits,
    callIndexes,
    properties,
    ttlMs = HOLD_TTL_MS,
    lockPrefix = "dfs",
  } = args;
  const lockId = `${lockPrefix}_${customerId}_${crypto.randomUUID()}`;
  const hold: UsageCreditHold = {
    lockId,
    featureId,
    estimatedCredits,
    callIndexes,
  };
  const attempt = () =>
    autumn.check(
      {
        customerId,
        featureId,
        requiredBalance: estimatedCredits,
        sendEvent: true,
        properties,
        lock: { lockId, enabled: true, expiresAt: Date.now() + ttlMs },
      },
      AUTUMN_TRACK_RETRY_OPTIONS,
    );

  let result = await attempt();
  if (result.allowed && !result.balance) {
    await sleep(300);
    try {
      result = await attempt();
    } catch (error) {
      if (!errorBodyIncludes(error, "lock_already_exists")) throw error;
      return { hold, allowed: true, balance: null };
    }
  }
  if (result.allowed && !result.balance) {
    // INTERNAL_ERROR, not UPSTREAM_UNAVAILABLE: this must stay reportable.
    throw new AppError(
      "INTERNAL_ERROR",
      `Autumn check returned no ${featureId} balance for customer ${customerId}`,
    );
  }
  return { hold, allowed: result.allowed, balance: result.balance };
}

/**
 * Reserves credits for a batch of provider calls before they are made, from
 * one estimate per call, and places each call where a hold of its own would
 * land: in order, on monthly `usage_credits` while they cover it, else on
 * `topup_credits`, else the call is refused. At most one hold per pool, so
 * the common case (monthly covers the batch) is a single Autumn request.
 *
 * Throws INSUFFICIENT_CREDITS when no call fits; `refusedCalls` lists the
 * ones that did not when some did. Either way the refusal event is emitted.
 * The caller must settle every returned hold with `settleUsageCredits` once
 * its calls' real cost is known.
 */
export async function reserveUsageCredits(args: {
  customer: BillingCustomerContext;
  customerId: string;
  callCredits: number[];
  creditFeature?: CreditFeature;
}): Promise<{ holds: UsageCreditHold[]; refusedCalls: number[] }> {
  const callCredits = args.callCredits.map((credits) => Math.max(1, credits));
  const allCalls = callCredits.map((_, index) => index);
  const creditsFor = (calls: number[]) =>
    calls.reduce((sum, index) => sum + callCredits[index], 0);
  const properties = {
    creditFeature: args.creditFeature,
    provider: "dataforseo",
    estimatedCredits: creditsFor(allCalls),
  };
  // Holds `featureId` for the calls, in order, that fit `remaining`; null
  // when none does. A refusal here means the balance moved since the read.
  const holdFitting = async (
    featureId: UsageCreditFeatureId,
    calls: number[],
    remaining = Infinity,
  ) => {
    const fitting: number[] = [];
    let credits = 0;
    for (const index of calls) {
      if (credits + callCredits[index] > remaining) continue;
      fitting.push(index);
      credits += callCredits[index];
    }
    if (fitting.length === 0) return null;
    return holdCredits({
      customerId: args.customerId,
      featureId,
      estimatedCredits: credits,
      callIndexes: fitting,
      properties,
    });
  };

  const holds: UsageCreditHold[] = [];
  let monthlyRemaining = 0;
  let topupRemaining = 0;
  let refusedCalls: number[] = [];
  try {
    const monthly = await holdFitting(
      AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
      allCalls,
    );
    if (monthly?.allowed) return { holds: [monthly.hold], refusedCalls };
    monthlyRemaining = monthly?.balance?.remaining ?? 0;

    const partial = await holdFitting(
      AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
      allCalls,
      monthlyRemaining,
    );
    if (partial?.allowed) holds.push(partial.hold);
    const topupCalls = allCalls.filter(
      (index) => !holds.some((hold) => hold.callIndexes.includes(index)),
    );

    let topup = await holdFitting(
      AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
      topupCalls,
    );
    if (topup && !topup.allowed) {
      topupRemaining = topup.balance?.remaining ?? 0;
      topup = await holdFitting(
        AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
        topupCalls,
        topupRemaining,
      );
    }
    if (topup?.allowed) holds.push(topup.hold);
    refusedCalls = allCalls.filter(
      (index) => !holds.some((hold) => hold.callIndexes.includes(index)),
    );
  } catch (error) {
    // A later hold failed after earlier ones landed: release those rather
    // than strand their credits until the hold TTL.
    for (const hold of holds) {
      await settleUsageCredits({ customer: args.customer, hold, costs: [] });
    }
    throw error;
  }

  if (refusedCalls.length > 0) {
    await captureServerEvent({
      distinctId: args.customer.userId,
      event: "usage:credits_gate_refused",
      organizationId: args.customer.organizationId,
      properties: {
        project_id: args.customer.projectId,
        reason: "estimate_exceeds_balance",
        source: "dataforseo",
        credit_feature: args.creditFeature,
        estimated_credits: creditsFor(refusedCalls),
        monthly_remaining: monthlyRemaining,
        topup_remaining: topupRemaining,
      },
    });
  }
  if (holds.length === 0) throw new AppError("INSUFFICIENT_CREDITS");
  return { holds, refusedCalls };
}

// The SDK throws 4xx responses with the raw response body attached. Autumn
// answers a reused lockId with 409 `lock_already_exists`, and a finalize for
// a lock it no longer holds with a 400 whose message starts "Lock not found"
// (the code is the generic invalid_request).
function errorBodyIncludes(error: unknown, text: string) {
  return (
    error instanceof Error &&
    "body" in error &&
    typeof error.body === "string" &&
    error.body.includes(text)
  );
}

/**
 * Confirms `credits` against a hold (Autumn deducts that amount, above or
 * below the hold, and returns the rest), or releases the hold when `credits`
 * is 0. Retries once. `landed: false` means the deduction may be lost; the
 * hold then expires at its TTL.
 */
export async function finalizeHold(
  hold: UsageCreditHold,
  credits: number,
  properties: Record<string, unknown>,
): Promise<{ landed: boolean; error?: unknown }> {
  // No SDK-level 5xx retry (AUTUMN_TRACK_RETRY_OPTIONS): this loop owns
  // the retry so a "Lock not found" can only be seen on our second attempt.
  const finalize = () =>
    autumn.balances.finalize(
      {
        lockId: hold.lockId,
        ...(credits > 0
          ? { action: "confirm", overrideValue: credits }
          : { action: "release" }),
        properties,
      },
      AUTUMN_TRACK_RETRY_OPTIONS,
    );

  let lastError: unknown;
  for (const attempt of [1, 2]) {
    if (attempt === 2) await sleep(250);
    try {
      if ((await finalize()).success) return { landed: true };
    } catch (error) {
      lastError = error;
      if (errorBodyIncludes(error, "Lock not found")) {
        // On the retry this means the first attempt landed; on the first
        // attempt the hold has already expired and the deduction is lost.
        return attempt === 2 ? { landed: true } : { landed: false, error };
      }
    }
  }
  return { landed: false, error: lastError };
}

/**
 * Settles a hold on the provider's real cost: confirms the deduction at the
 * actual credits (Autumn deducts the override, above or below the hold, and
 * returns the rest) or releases the hold when nothing was billed. A hold can
 * cover several provider calls; each is credited separately, so a batch is
 * charged exactly what the same calls would cost one by one. Never
 * throws: the customer already has the data, so a finalize that still fails
 * after one retry is logged with everything needed to reconcile it and the
 * hold expires at its TTL.
 */
export async function settleUsageCredits(args: {
  customer: BillingCustomerContext;
  hold: UsageCreditHold;
  /** Resolved from the billed path by the caller; unknown for an unbilled call. */
  creditFeature?: CreditFeature;
  /** Billed provider calls under this hold; empty when none was charged. */
  costs: Array<{ costUsd: number; path: string[] }>;
}): Promise<void> {
  const { customer, hold, creditFeature, costs } = args;
  let actualCredits = 0;
  let totalCostUsd = 0;
  for (const cost of costs) {
    actualCredits += creditsForProviderUsd(cost.costUsd);
    totalCostUsd += applyBillingMarkupUsd(cost.costUsd);
  }
  const paths = [...new Set(costs.map((cost) => cost.path.join("/")))];

  const { landed, error } = await finalizeHold(hold, actualCredits, {
    creditFeature,
    provider: "dataforseo",
    paths,
    totalCostUsd,
    estimatedCredits: hold.estimatedCredits,
  });
  if (!landed) {
    console.error("[autumn] finalize failed", {
      organizationId: customer.organizationId,
      lockId: hold.lockId,
      held: hold.estimatedCredits,
      actual: actualCredits,
      error,
    });
    return;
  }
  if (actualCredits <= 0) return;

  const onMonthly = hold.featureId === AUTUMN_SEO_DATA_BALANCE_FEATURE_ID;
  await captureCreditsConsumed(customer, {
    credit_feature: creditFeature,
    monthly_credits: onMonthly ? actualCredits : 0,
    topup_credits: onMonthly ? 0 : actualCredits,
    total_credits: actualCredits,
    cost_usd: totalCostUsd,
    estimated_credits: hold.estimatedCredits,
    paths,
  });

  // The estimate is meant to be an upper bound; an undershoot means a price
  // constant in pricing.ts is stale and the spend bound has a hole.
  if (actualCredits > hold.estimatedCredits) {
    console.error("[billing] estimate undershoot", {
      paths,
      estimated: hold.estimatedCredits,
      actual: actualCredits,
    });
  }
}

function captureCreditsConsumed(
  customer: BillingCustomerContext,
  properties: Record<string, unknown>,
) {
  return captureServerEvent({
    distinctId: customer.userId,
    event: "usage:credits_consume",
    organizationId: customer.organizationId,
    properties: { project_id: customer.projectId, ...properties },
  });
}

/**
 * Deducts a USD provider cost from the org's shared usage-credit pool after
 * the fact: applies the platform markup, converts to credits, spends monthly
 * `usage_credits` first then `topup_credits`, and emits the
 * usage:credits_consume event. LLM research uses this (token cost is
 * unknowable up front); DataForSEO calls reserve-then-settle instead. Pass
 * `monthlyRemaining` from the balance check that gated the call.
 */
export async function trackUsageCreditSpend(args: {
  customer: BillingCustomerContext;
  customerId: string;
  creditFeature: CreditFeature;
  costUsd: number;
  monthlyRemaining: number;
  /**
   * Admitted research spends available top-ups, then overdraws monthly credits.
   * Every hosted org has a monthly balance; a top-up balance may not exist yet.
   */
  overdraft?: { topupRemaining: number };
  properties?: Record<string, unknown>;
}): Promise<{ monthlyCredits: number; topupCredits: number }> {
  const totalCostUsd = applyBillingMarkupUsd(args.costUsd);
  const totalCostCredits = creditsForProviderUsd(args.costUsd);
  if (totalCostCredits <= 0) return { monthlyCredits: 0, topupCredits: 0 };

  // Clamp at 0: Autumn balances can read negative after an overdraft, and a
  // negative monthly reading here would inflate the topup deduction.
  let monthlyDeduct = Math.min(
    Math.max(args.monthlyRemaining, 0),
    totalCostCredits,
  );
  let topupDeduct = totalCostCredits - monthlyDeduct;
  if (args.overdraft) {
    topupDeduct = Math.min(
      topupDeduct,
      Math.max(args.overdraft.topupRemaining, 0),
    );
    monthlyDeduct = totalCostCredits - topupDeduct;
  }

  const properties = {
    currency: "USD",
    creditFeature: args.creditFeature,
    totalCostUsd,
    totalCostCredits,
    ...args.properties,
  };

  if (monthlyDeduct > 0) {
    await autumn.track(
      {
        customerId: args.customerId,
        featureId: AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
        value: monthlyDeduct,
        // Research explicitly permits debt; Autumn otherwise caps at zero.
        overageBehavior: args.overdraft ? "overflow" : undefined,
        properties: {
          ...properties,
          balanceFeatureId: AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
        },
      },
      AUTUMN_TRACK_RETRY_OPTIONS,
    );
  }

  if (topupDeduct > 0) {
    await autumn.track(
      {
        customerId: args.customerId,
        featureId: AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
        value: topupDeduct,
        overageBehavior: args.overdraft ? "overflow" : undefined,
        properties: {
          ...properties,
          balanceFeatureId: AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
        },
      },
      AUTUMN_TRACK_RETRY_OPTIONS,
    );
  }

  await captureCreditsConsumed(args.customer, {
    credit_feature: args.creditFeature,
    monthly_credits: monthlyDeduct,
    topup_credits: topupDeduct,
    total_credits: totalCostCredits,
    cost_usd: totalCostUsd,
  });
  return { monthlyCredits: monthlyDeduct, topupCredits: topupDeduct };
}
