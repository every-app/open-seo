import type { EnsuredUserContext } from "@/middleware/ensure-user/types";
import { AUTUMN_PAID_PLAN_ID } from "@/shared/billing";
import { autumn } from "@/server/billing/autumn";
import { AppError } from "@/server/lib/errors";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";

export type BillingCustomerContext = Pick<
  EnsuredUserContext,
  "organizationId" | "userEmail"
>;

export async function getOrCreateOrganizationCustomer(
  context: BillingCustomerContext,
) {
  const customer = await autumn.customers.getOrCreate({
    customerId: context.organizationId,
    name: context.organizationId,
  });

  if (!customer.id) {
    throw new AppError("INTERNAL_ERROR", "Failed to resolve billing customer");
  }

  return {
    ...customer,
    id: customer.id,
  };
}

export function hasActivePaidPlan(customer: {
  subscriptions: Array<{
    planId: string;
    status: string;
    pastDue: boolean;
    canceledAt: number | null;
  }>;
}) {
  return customer.subscriptions.some(
    (subscription) =>
      subscription.planId === AUTUMN_PAID_PLAN_ID &&
      subscription.status === "active" &&
      !subscription.pastDue,
  );
}

export async function requireHostedPaidSubscription(
  context: BillingCustomerContext,
) {
  if (!(await isHostedServerAuthMode())) {
    return;
  }

  const customer = await getOrCreateOrganizationCustomer(context);
  if (!hasActivePaidPlan(customer)) {
    throw new AppError("PAYMENT_REQUIRED");
  }
}
