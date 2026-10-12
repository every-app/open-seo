import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { billingCustomerStatus } from "@/db/schema";
import { autumn } from "@/server/billing/autumn";
import {
  deriveBillingCustomerStatusSnapshot,
  type BillingCustomerStatusSnapshot,
} from "./customer-status-model";
import { deriveBillingLifecycleEvents } from "./lifecycle-events";
import { syncBillingStatusToLoops } from "./loops-sync";

export async function syncAutumnCustomerStatus(customerId: string) {
  // getOrCreate is effectively a "get" here — a billing.updated webhook always
  // references an existing Autumn customer. The SDK returns the camelCase shape.
  const customer = await autumn.customers.getOrCreate({ customerId });
  const snapshot = deriveBillingCustomerStatusSnapshot(customer);

  // Lifecycle emails are the diff between the last stored customer and this
  // one. Loops is called before the row is written: an outage fails the
  // webhook, Autumn retries, and the same diff produces the same idempotency
  // keys.
  //
  // No stored row means no emails. Every new organization gets a row on its
  // first webhook (the free plan auto-enables at signup, before anyone can
  // pay), so a missing row is a customer from before the table existed, whose
  // next renewal or top-up must not read as a new subscription.
  const previous = await getPreviousSnapshot(customerId);
  await syncBillingStatusToLoops({
    snapshot,
    events: previous ? deriveBillingLifecycleEvents(previous, snapshot) : [],
    previousSyncedAt: previous?.syncedAt ?? null,
  });

  await upsertBillingCustomerStatus(snapshot);
  return snapshot;
}

async function getPreviousSnapshot(organizationId: string) {
  const [row] = await db
    .select({
      customerJson: billingCustomerStatus.customerJson,
      syncedAt: billingCustomerStatus.syncedAt,
    })
    .from(billingCustomerStatus)
    .where(eq(billingCustomerStatus.organizationId, organizationId))
    .limit(1);
  if (!row) return null;
  return {
    ...deriveBillingCustomerStatusSnapshot(JSON.parse(row.customerJson)),
    syncedAt: row.syncedAt,
  };
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
