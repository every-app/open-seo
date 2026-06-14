import { sql } from "drizzle-orm";
import { db } from "@/db";
import { billingCustomerStatus } from "@/db/schema";
import { autumn } from "@/server/billing/autumn";
import {
  deriveBillingCustomerStatusSnapshot,
  type BillingCustomerStatusSnapshot,
} from "./customer-status-model";
import { syncBillingStatusToLoops } from "./loops-sync";

export async function syncAutumnCustomerStatus(customerId: string) {
  // getOrCreate is effectively a "get" here — a billing.updated webhook always
  // references an existing Autumn customer. The SDK returns the camelCase shape.
  const customer = await autumn.customers.getOrCreate({ customerId });
  const snapshot = deriveBillingCustomerStatusSnapshot(customer);
  await upsertBillingCustomerStatus(snapshot);
  await syncBillingStatusToLoops(snapshot);
  return snapshot;
}

async function upsertBillingCustomerStatus(
  snapshot: BillingCustomerStatusSnapshot,
) {
  await db
    .insert(billingCustomerStatus)
    .values(snapshot)
    .onConflictDoUpdate({
      target: billingCustomerStatus.organizationId,
      set: {
        isPaying: snapshot.isPaying,
        paidPlanId: snapshot.paidPlanId,
        paidPlanStatus: snapshot.paidPlanStatus,
        customerJson: snapshot.customerJson,
        syncedAt: snapshot.syncedAt,
        updatedAt: sql`(current_timestamp)`,
      },
    });
}
