import { AUTUMN_PAID_PLAN_FEATURE_ID } from "@/shared/billing";

export type PlanStatus = "free" | "paid";

export function getCustomerPlanStatus(
  customer: { flags?: Record<string, unknown> } | undefined,
): PlanStatus {
  return customer?.flags?.[AUTUMN_PAID_PLAN_FEATURE_ID] ? "paid" : "free";
}
