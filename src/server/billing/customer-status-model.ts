import { z } from "zod";
import { AUTUMN_PAID_PLAN_FEATURE_ID } from "@/shared/billing";

// The subset of the Autumn SDK's `Customer` we read, in the SDK's camelCase.
// The same schema parses a fresh SDK object and a `customerJson` row written
// by an earlier sync; everything else passes through into `customerJson`.
const autumnSubscriptionSchema = z
  .object({
    planId: z.string().nullish(),
    status: z.string().nullish(),
    pastDue: z.boolean().nullish(),
    canceledAt: z.number().nullish(),
  })
  .passthrough();

const autumnCustomerSchema = z
  .object({
    id: z.string().nullish(),
    subscriptions: z.array(autumnSubscriptionSchema).optional(),
    flags: z
      .record(
        z.string(),
        z.object({ planId: z.string().nullish() }).passthrough().optional(),
      )
      .optional(),
  })
  .passthrough();

export type BillingCustomerStatusSnapshot = {
  organizationId: string;
  isPaying: boolean;
  paidPlanId: string | null;
  paidPlanStatus: string | null;
  // Lifecycle detail read from the paid subscription. Not stored as columns:
  // the previous snapshot is rebuilt from `customerJson`, so these stay
  // derivable without widening the table.
  pastDue: boolean;
  canceledAt: number | null;
  customerJson: string;
  syncedAt: string;
};

export function deriveBillingCustomerStatusSnapshot(
  input: unknown,
): BillingCustomerStatusSnapshot {
  const customer = autumnCustomerSchema.parse(input);
  const organizationId = customer.id;
  if (!organizationId) {
    throw new Error("Autumn customer is missing an id");
  }

  // Autumn names the plan that granted `paid_plan`, so every plan configured
  // to grant it counts as paid without listing plan IDs here. A flag with no
  // plan (granted by hand) has no subscription to report on.
  const paidPlanId =
    customer.flags?.[AUTUMN_PAID_PLAN_FEATURE_ID]?.planId ?? null;
  const subscription = paidPlanId
    ? selectSubscription(customer.subscriptions ?? [], paidPlanId)
    : null;

  return {
    organizationId,
    isPaying: subscription?.status === "active",
    paidPlanId,
    paidPlanStatus: subscription?.status ?? null,
    pastDue: subscription?.pastDue === true,
    canceledAt: subscription?.canceledAt ?? null,
    // Full payload kept verbatim — query rarely-used fields via json_extract.
    customerJson: JSON.stringify(customer),
    syncedAt: new Date().toISOString(),
  };
}

// Prefer the active row; fall back to any row for the plan so a past-due or
// scheduled state is still recorded.
function selectSubscription(
  subscriptions: z.infer<typeof autumnSubscriptionSchema>[],
  planId: string,
) {
  const rows = subscriptions.filter((s) => s.planId === planId);
  return rows.find((s) => s.status === "active") ?? rows[0] ?? null;
}
