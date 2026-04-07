import type { EnsuredUserContext } from "@/middleware/ensure-user/types";
import { AUTUMN_MANAGED_SERVICE_ACCESS_FEATURE_ID } from "@/shared/billing";
import { autumn } from "@/server/billing/autumn";
import { AppError } from "@/server/lib/errors";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";

export type BillingCustomerContext = Pick<
  EnsuredUserContext,
  "organizationId" | "userEmail" | "userId"
> & {
  projectId?: string;
};

export async function getOrCreateOrganizationCustomer(
  context: BillingCustomerContext,
) {
  const customer = await autumn.customers.getOrCreate({
    customerId: context.organizationId,
  });

  if (!customer.id) {
    throw new AppError("INTERNAL_ERROR", "Failed to resolve billing customer");
  }

  return {
    ...customer,
    id: customer.id,
  };
}

export async function customerHasManagedServiceAccess(customerId: string) {
  const result = await autumn.check({
    customerId,
    featureId: AUTUMN_MANAGED_SERVICE_ACCESS_FEATURE_ID,
  });

  return result.allowed;
}

export async function requireManagedServiceAccess(
  context: BillingCustomerContext,
) {
  if (!(await isHostedServerAuthMode())) {
    return;
  }

  const customer = await getOrCreateOrganizationCustomer(context);
  if (!(await customerHasManagedServiceAccess(customer.id))) {
    throw new AppError("PAYMENT_REQUIRED");
  }
}
