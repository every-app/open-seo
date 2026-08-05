import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { stripeConnections } from "@/db/schema";

export type StripeConnection = typeof stripeConnections.$inferSelect;

async function getByProjectId(
  projectId: string,
): Promise<StripeConnection | null> {
  const rows = await db
    .select()
    .from(stripeConnections)
    .where(eq(stripeConnections.projectId, projectId))
    .limit(1);
  return rows[0] ?? null;
}

async function upsert(input: {
  projectId: string;
  organizationId: string;
  stripeAccountId: string | null;
  subscriptionProductId: string | null;
  subscriptionProductName: string | null;
  oneOffProductId: string | null;
  oneOffProductName: string | null;
  connectedByUserId: string;
}): Promise<StripeConnection> {
  const [row] = await db
    .insert(stripeConnections)
    .values({ id: crypto.randomUUID(), ...input })
    .onConflictDoUpdate({
      target: stripeConnections.projectId,
      set: {
        organizationId: input.organizationId,
        stripeAccountId: input.stripeAccountId,
        subscriptionProductId: input.subscriptionProductId,
        subscriptionProductName: input.subscriptionProductName,
        oneOffProductId: input.oneOffProductId,
        oneOffProductName: input.oneOffProductName,
        connectedByUserId: input.connectedByUserId,
        updatedAt: sql`(current_timestamp)`,
      },
    })
    .returning();
  if (!row) {
    throw new Error("Failed to upsert stripe_connection");
  }
  return row;
}

async function deleteByProjectId(projectId: string): Promise<void> {
  await db
    .delete(stripeConnections)
    .where(eq(stripeConnections.projectId, projectId));
}

export const StripeConnectionRepository = {
  getByProjectId,
  upsert,
  deleteByProjectId,
};
