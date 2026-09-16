import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bingConnections } from "@/db/schema";

export type BingConnection = typeof bingConnections.$inferSelect;

async function getByProjectId(
  projectId: string,
): Promise<BingConnection | null> {
  const rows = await db
    .select()
    .from(bingConnections)
    .where(eq(bingConnections.projectId, projectId))
    .limit(1);
  return rows[0] ?? null;
}

async function upsert(input: {
  projectId: string;
  organizationId: string;
  siteUrl: string;
  connectedByUserId: string;
}): Promise<BingConnection> {
  const [row] = await db
    .insert(bingConnections)
    .values({ id: crypto.randomUUID(), ...input })
    .onConflictDoUpdate({
      target: bingConnections.projectId,
      set: {
        siteUrl: input.siteUrl,
        organizationId: input.organizationId,
        connectedByUserId: input.connectedByUserId,
        updatedAt: sql`(current_timestamp)`,
      },
    })
    .returning();
  if (!row) {
    throw new Error("Failed to upsert bing_connection");
  }
  return row;
}

async function deleteByProjectId(projectId: string): Promise<void> {
  await db
    .delete(bingConnections)
    .where(eq(bingConnections.projectId, projectId));
}

export const BingConnectionRepository = {
  getByProjectId,
  upsert,
  deleteByProjectId,
};
