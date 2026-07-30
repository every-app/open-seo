import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { gbpConnections } from "@/db/schema";

export type GbpConnection = typeof gbpConnections.$inferSelect;

async function getByProjectId(
  projectId: string,
): Promise<GbpConnection | null> {
  const rows = await db
    .select()
    .from(gbpConnections)
    .where(eq(gbpConnections.projectId, projectId))
    .limit(1);
  return rows[0] ?? null;
}

async function upsert(input: {
  projectId: string;
  organizationId: string;
  locationName: string;
  connectedByUserId: string;
  gbpAccountId: string;
  connectedAccountEmail: string | null;
}): Promise<GbpConnection> {
  const [row] = await db
    .insert(gbpConnections)
    .values({ id: crypto.randomUUID(), ...input })
    .onConflictDoUpdate({
      target: gbpConnections.projectId,
      set: {
        locationName: input.locationName,
        organizationId: input.organizationId,
        connectedByUserId: input.connectedByUserId,
        gbpAccountId: input.gbpAccountId,
        connectedAccountEmail: sql`coalesce(${input.connectedAccountEmail}, ${gbpConnections.connectedAccountEmail})`,
        updatedAt: sql`(current_timestamp)`,
      },
    })
    .returning();
  if (!row) {
    throw new Error("Failed to upsert gbp_connection");
  }
  return row;
}

async function deleteByProjectId(projectId: string): Promise<void> {
  await db
    .delete(gbpConnections)
    .where(eq(gbpConnections.projectId, projectId));
}

async function existsForConnectorAccount(
  userId: string,
  gbpAccountId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: gbpConnections.id })
    .from(gbpConnections)
    .where(
      and(
        eq(gbpConnections.connectedByUserId, userId),
        eq(gbpConnections.gbpAccountId, gbpAccountId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export const GbpConnectionRepository = {
  getByProjectId,
  upsert,
  deleteByProjectId,
  existsForConnectorAccount,
};
