import { AUTUMN_PAID_PLAN_ID, AUTUMN_YC_PLAN_ID } from "@/shared/billing";
import type { BillingCustomerStatusSnapshot } from "./customer-status-model";

// Leaf module (no runtime imports) so the transition rules are unit-testable.

// Plans that charge money. A plan can grant `paid_plan` without a price
// (friends and family), and those customers are not thanked for subscribing.
const PRICED_PLAN_IDS: ReadonlySet<string> = new Set([
  AUTUMN_PAID_PLAN_ID,
  AUTUMN_YC_PLAN_ID,
]);

export type BillingLifecycleEvent = {
  name: "subscription_started" | "payment_failed" | "subscription_canceled";
  planId: string;
};

type LifecycleSnapshot = Pick<
  BillingCustomerStatusSnapshot,
  "paidPlanId" | "paidPlanStatus" | "isPaying" | "pastDue" | "canceledAt"
>;

/**
 * Compares the customer as it was at the last webhook with the customer as it
 * is now and names the transitions worth an email. A retried webhook compares
 * identical snapshots and yields nothing, which is the dedup.
 *
 * Silent on purpose: upgrades between priced plans, un-cancelling, and a
 * past-due subscription finally expiring (they already got the payment email
 * and did not choose to leave).
 */
export function deriveBillingLifecycleEvents(
  previous: LifecycleSnapshot,
  next: LifecycleSnapshot,
): BillingLifecycleEvent[] {
  const events: BillingLifecycleEvent[] = [];

  if (isPricedSubscriber(next) && !isPricedSubscriber(previous)) {
    events.push({ name: "subscription_started", planId: next.paidPlanId! });
  }

  if (next.pastDue && isPricedPlan(next.paidPlanId) && !previous.pastDue) {
    events.push({ name: "payment_failed", planId: next.paidPlanId! });
  }

  const wasInGoodStanding =
    isPricedSubscriber(previous) &&
    !previous.pastDue &&
    previous.canceledAt === null;
  const isInGoodStanding = isPricedSubscriber(next) && next.canceledAt === null;
  if (wasInGoodStanding && !isInGoodStanding) {
    events.push({
      name: "subscription_canceled",
      planId: previous.paidPlanId!,
    });
  }

  return events;
}

/** Contact-level summary for Loops audience filters. Covers every plan that
 *  grants `paid_plan`, not just priced ones, so segments keep matching the
 *  existing `billingPlanId`/`billingPlanStatus` properties. */
export function getBillingState(
  snapshot: Pick<
    LifecycleSnapshot,
    "paidPlanId" | "paidPlanStatus" | "pastDue" | "canceledAt"
  >,
) {
  if (!snapshot.paidPlanId) return "none";
  if (snapshot.pastDue) return "past_due";
  if (snapshot.canceledAt !== null) return "canceling";
  return snapshot.paidPlanStatus ?? "none";
}

function isPricedPlan(planId: string | null) {
  return planId !== null && PRICED_PLAN_IDS.has(planId);
}

function isPricedSubscriber(snapshot: LifecycleSnapshot) {
  return snapshot.isPaying && isPricedPlan(snapshot.paidPlanId);
}
