import type { BillingCustomerStatusSnapshot } from "./customer-status-model";

// Leaf module (no runtime imports) so the transition rules are unit-testable.
//
// Only plans that charge a price send emails. A plan can grant `paid_plan`
// without one (friends and family), and those customers are not thanked for
// subscribing. Autumn says which plans are priced, so plans sold off-site
// (annual plans on an invoice) need no code change.

export type BillingLifecycleEvent = {
  name: "subscription_started" | "payment_failed" | "subscription_canceled";
  planId: string;
};

type LifecycleSnapshot = Pick<
  BillingCustomerStatusSnapshot,
  | "paidPlanId"
  | "paidPlanStatus"
  | "isPaying"
  | "pastDue"
  | "canceledAt"
  | "paidPlanPriced"
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
  stored: LifecycleSnapshot,
  next: LifecycleSnapshot,
): BillingLifecycleEvent[] {
  const previous = withPricing(stored, next);
  const events: BillingLifecycleEvent[] = [];

  if (isPricedSubscriber(next) && !isPricedSubscriber(previous)) {
    events.push({ name: "subscription_started", planId: next.paidPlanId! });
  }

  if (next.pastDue && next.paidPlanPriced === true && !previous.pastDue) {
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

function isPricedSubscriber(snapshot: LifecycleSnapshot) {
  return snapshot.isPaying && snapshot.paidPlanPriced === true;
}

// Rows stored before the sync expanded plans don't say whether the plan was
// priced. The same plan is priced now if it was then; a plan being left was
// a paying one (the only other kind, friends and family, is rare enough to
// risk one wrong or missed email).
function withPricing(
  stored: LifecycleSnapshot,
  next: LifecycleSnapshot,
): LifecycleSnapshot {
  if (stored.paidPlanPriced !== null || stored.paidPlanId === null) {
    return stored;
  }
  return {
    ...stored,
    paidPlanPriced:
      stored.paidPlanId === next.paidPlanId ? next.paidPlanPriced : true,
  };
}
