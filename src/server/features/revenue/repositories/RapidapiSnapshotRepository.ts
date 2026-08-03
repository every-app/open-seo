import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { rapidapiSnapshots } from "@/db/schema";

export type RapidapiSnapshot = typeof rapidapiSnapshots.$inferSelect;

async function listByProjectId(projectId: string): Promise<RapidapiSnapshot[]> {
  return db
    .select()
    .from(rapidapiSnapshots)
    .where(eq(rapidapiSnapshots.projectId, projectId))
    .orderBy(desc(rapidapiSnapshots.capturedOn));
}

async function upsert(input: {
  projectId: string;
  organizationId: string;
  capturedOn: string;
  activeSubscribers: number;
  payingSubscribers: number | null;
  createdByUserId: string;
}): Promise<RapidapiSnapshot> {
  const [row] = await db
    .insert(rapidapiSnapshots)
    .values({ id: crypto.randomUUID(), ...input })
    .onConflictDoUpdate({
      target: [rapidapiSnapshots.projectId, rapidapiSnapshots.capturedOn],
      set: {
        activeSubscribers: input.activeSubscribers,
        payingSubscribers: input.payingSubscribers,
        createdByUserId: input.createdByUserId,
        updatedAt: sql`(current_timestamp)`,
      },
    })
    .returning();
  if (!row) {
    throw new Error("Failed to upsert rapidapi_snapshot");
  }
  return row;
}

async function deleteById(projectId: string, id: string): Promise<void> {
  await db
    .delete(rapidapiSnapshots)
    .where(
      and(
        eq(rapidapiSnapshots.projectId, projectId),
        eq(rapidapiSnapshots.id, id),
      ),
    );
}

export const RapidapiSnapshotRepository = {
  listByProjectId,
  upsert,
  deleteById,
};
