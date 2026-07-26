import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { vercelConnections } from "@/db/schema";

export type VercelConnection = typeof vercelConnections.$inferSelect;

async function getByProjectId(
  projectId: string,
): Promise<VercelConnection | null> {
  const rows = await db
    .select()
    .from(vercelConnections)
    .where(eq(vercelConnections.projectId, projectId))
    .limit(1);
  return rows[0] ?? null;
}

async function upsert(input: {
  projectId: string;
  organizationId: string;
  vercelProjectId: string;
  vercelTeamId: string | null;
  vercelProjectName: string;
  connectedByUserId: string;
}): Promise<VercelConnection> {
  const [row] = await db
    .insert(vercelConnections)
    .values({ id: crypto.randomUUID(), ...input })
    .onConflictDoUpdate({
      target: vercelConnections.projectId,
      set: {
        organizationId: input.organizationId,
        vercelProjectId: input.vercelProjectId,
        vercelTeamId: input.vercelTeamId,
        vercelProjectName: input.vercelProjectName,
        connectedByUserId: input.connectedByUserId,
        updatedAt: sql`(current_timestamp)`,
      },
    })
    .returning();
  if (!row) {
    throw new Error("Failed to upsert vercel_connection");
  }
  return row;
}

async function deleteByProjectId(projectId: string): Promise<void> {
  await db
    .delete(vercelConnections)
    .where(eq(vercelConnections.projectId, projectId));
}

export const VercelConnectionRepository = {
  getByProjectId,
  upsert,
  deleteByProjectId,
};
