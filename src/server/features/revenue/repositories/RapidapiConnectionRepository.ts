import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { rapidapiConnections } from "@/db/schema";

export type RapidapiConnection = typeof rapidapiConnections.$inferSelect;

async function getByProjectId(
  projectId: string,
): Promise<RapidapiConnection | null> {
  const rows = await db
    .select()
    .from(rapidapiConnections)
    .where(eq(rapidapiConnections.projectId, projectId))
    .limit(1);
  return rows[0] ?? null;
}

async function upsert(input: {
  projectId: string;
  organizationId: string;
  rapidapiApiId: string;
  rapidapiApiName: string | null;
  connectedByUserId: string;
}): Promise<RapidapiConnection> {
  const [row] = await db
    .insert(rapidapiConnections)
    .values({ id: crypto.randomUUID(), ...input })
    .onConflictDoUpdate({
      target: rapidapiConnections.projectId,
      set: {
        organizationId: input.organizationId,
        rapidapiApiId: input.rapidapiApiId,
        rapidapiApiName: input.rapidapiApiName,
        connectedByUserId: input.connectedByUserId,
        updatedAt: sql`(current_timestamp)`,
      },
    })
    .returning();
  if (!row) {
    throw new Error("Failed to upsert rapidapi_connection");
  }
  return row;
}

async function deleteByProjectId(projectId: string): Promise<void> {
  await db
    .delete(rapidapiConnections)
    .where(eq(rapidapiConnections.projectId, projectId));
}

export const RapidapiConnectionRepository = {
  getByProjectId,
  upsert,
  deleteByProjectId,
};
