import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { psiSnapshots } from "@/db/schema";

export type PsiSnapshot = typeof psiSnapshots.$inferSelect;
export type PsiSnapshotInsert = Omit<
  typeof psiSnapshots.$inferInsert,
  "id" | "createdAt"
>;

async function insertMany(values: PsiSnapshotInsert[]): Promise<PsiSnapshot[]> {
  if (values.length === 0) return [];
  return db
    .insert(psiSnapshots)
    .values(values.map((value) => ({ id: crypto.randomUUID(), ...value })))
    .returning();
}

/** Newest-first snapshots for a whole project. Callers reduce this in JS to
 *  "latest per URL x strategy" — a window function would have to be written
 *  twice, once per dialect, for a set this small. */
async function listByProjectId(
  projectId: string,
  limit: number,
): Promise<PsiSnapshot[]> {
  return db
    .select()
    .from(psiSnapshots)
    .where(eq(psiSnapshots.projectId, projectId))
    .orderBy(desc(psiSnapshots.createdAt))
    .limit(limit);
}

/** Scoped by project so a snapshot id from another project is unreachable. */
async function getByIdForProject(
  id: string,
  projectId: string,
): Promise<PsiSnapshot | null> {
  const rows = await db
    .select()
    .from(psiSnapshots)
    .where(and(eq(psiSnapshots.id, id), eq(psiSnapshots.projectId, projectId)))
    .limit(1);
  return rows[0] ?? null;
}

export const PagespeedSnapshotRepository = {
  insertMany,
  listByProjectId,
  getByIdForProject,
};
