import { and, eq, sql } from "drizzle-orm";
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
  bingAccountId: string;
  connectedAccountEmail: string | null;
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
        bingAccountId: input.bingAccountId,
        connectedAccountEmail: sql`coalesce(${input.connectedAccountEmail}, ${bingConnections.connectedAccountEmail})`,
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

async function existsForConnectorAccount(
  userId: string,
  bingAccountId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: bingConnections.id })
    .from(bingConnections)
    .where(
      and(
        eq(bingConnections.connectedByUserId, userId),
        eq(bingConnections.bingAccountId, bingAccountId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export const BingConnectionRepository = {
  getByProjectId,
  upsert,
  deleteByProjectId,
  existsForConnectorAccount,
};
