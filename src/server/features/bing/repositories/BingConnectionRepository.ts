import { and, eq, isNull, sql } from "drizzle-orm";
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
  // Null means the connector's delegated OAuth grant, not a stored API key.
  credentialId: string | null;
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
        credentialId: input.credentialId,
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

/** Whether any other project still uses this credential, so a disconnect only
 *  unlinks the key when its owner has no remaining Bing connections. */
async function countByCredentialId(credentialId: string): Promise<number> {
  const rows = await db
    .select({ id: bingConnections.id })
    .from(bingConnections)
    .where(eq(bingConnections.credentialId, credentialId));
  return rows.length;
}

/** Delete every OAuth-backed mapping for a user (credentialId null). Removing
 *  an OAuth grant must orphan no mappings, since grants live in the shared
 *  `account` table where no foreign key can cascade from. */
async function deleteOAuthMappingsForUser(userId: string): Promise<void> {
  await db
    .delete(bingConnections)
    .where(
      and(
        eq(bingConnections.connectedByUserId, userId),
        isNull(bingConnections.credentialId),
      ),
    );
}

export const BingConnectionRepository = {
  getByProjectId,
  upsert,
  deleteByProjectId,
  countByCredentialId,
  deleteOAuthMappingsForUser,
};
