import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { gscConnections } from "@/db/schema";

export type GscConnection = typeof gscConnections.$inferSelect;

async function getByProjectId(
  projectId: string,
): Promise<GscConnection | null> {
  const rows = await db
    .select()
    .from(gscConnections)
    .where(eq(gscConnections.projectId, projectId))
    .limit(1);
  return rows[0] ?? null;
}

async function upsert(input: {
  projectId: string;
  organizationId: string;
  siteUrl: string;
  connectedByUserId: string;
  connectedAccountEmail: string | null;
}): Promise<GscConnection> {
  const [row] = await db
    .insert(gscConnections)
    .values({ id: crypto.randomUUID(), ...input })
    .onConflictDoUpdate({
      target: gscConnections.projectId,
      set: {
        siteUrl: input.siteUrl,
        organizationId: input.organizationId,
        connectedByUserId: input.connectedByUserId,
        connectedAccountEmail: input.connectedAccountEmail,
        updatedAt: sql`(current_timestamp)`,
      },
    })
    .returning();
  if (!row) {
    throw new Error("Failed to upsert gsc_connection");
  }
  return row;
}

async function deleteByProjectId(projectId: string): Promise<void> {
  await db
    .delete(gscConnections)
    .where(eq(gscConnections.projectId, projectId));
}

/** Whether this user is still the connector for any project's GSC property. */
async function existsForConnector(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: gscConnections.id })
    .from(gscConnections)
    .where(eq(gscConnections.connectedByUserId, userId))
    .limit(1);
  return rows.length > 0;
}

export const GscConnectionRepository = {
  getByProjectId,
  upsert,
  deleteByProjectId,
  existsForConnector,
};
