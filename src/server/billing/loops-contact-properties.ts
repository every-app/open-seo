import type { BillingCustomerStatusSnapshot } from "./customer-status-model";
import { getBillingState } from "./lifecycle-events";

export const LOOPS_BILLING_PLAN_NONE = "none";

export function getBillingLoopsContactProperties(
  snapshot: Pick<
    BillingCustomerStatusSnapshot,
    "paidPlanId" | "paidPlanStatus" | "pastDue" | "canceledAt"
  >,
) {
  return {
    billingPlanId: snapshot.paidPlanId ?? LOOPS_BILLING_PLAN_NONE,
    billingPlanStatus: snapshot.paidPlanStatus ?? LOOPS_BILLING_PLAN_NONE,
    // One property Loops workflows can filter on for "still in good standing".
    billingState: getBillingState(snapshot),
  };
}
