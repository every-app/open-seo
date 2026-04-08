import { AUTUMN_PAID_PLAN_ID } from "@/shared/billing";

export type PlanStatus = "free" | "paid";

export function getCustomerPlanStatus(
  customer:
    | { subscriptions?: Array<{ planId: string; status: string }> }
    | undefined,
): PlanStatus {
  if (!customer?.subscriptions) return "free";

  const hasActivePaid = customer.subscriptions.some(
    (sub) => sub.planId === AUTUMN_PAID_PLAN_ID && sub.status === "active",
  );

  return hasActivePaid ? "paid" : "free";
}
