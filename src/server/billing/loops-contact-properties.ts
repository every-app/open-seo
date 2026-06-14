import type { BillingCustomerStatusSnapshot } from "./customer-status-model";

export const LOOPS_BILLING_PLAN_NONE = "none";

export function getBillingLoopsContactProperties(
  snapshot: Pick<
    BillingCustomerStatusSnapshot,
    "paidPlanId" | "paidPlanStatus"
  >,
) {
  return {
    billingPlanId: snapshot.paidPlanId ?? LOOPS_BILLING_PLAN_NONE,
    billingPlanStatus: snapshot.paidPlanStatus ?? LOOPS_BILLING_PLAN_NONE,
  };
}
