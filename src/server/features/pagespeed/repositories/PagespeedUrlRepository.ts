import { and, asc, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { psiUrls } from "@/db/schema";

export type PsiUrl = typeof psiUrls.$inferSelect;

/** Monitored URLs for a project, homepage first then oldest-added first. */
async function listByProjectId(projectId: string): Promise<PsiUrl[]> {
  const rows = await db
    .select()
    .from(psiUrls)
    .where(eq(psiUrls.projectId, projectId))
    .orderBy(asc(psiUrls.createdAt));
  return rows.toSorted(
    (a, b) => Number(b.isHomepage) - Number(a.isHomepage),
  );
}

/** Scoped by project so a URL id from another project can never be reached. */
async function getByIdForProject(
  id: string,
  projectId: string,
): Promise<PsiUrl | null> {
  const rows = await db
    .select()
    .from(psiUrls)
    .where(and(eq(psiUrls.id, id), eq(psiUrls.projectId, projectId)))
    .limit(1);
  return rows[0] ?? null;
}

async function insert(input: {
  projectId: string;
  organizationId: string;
  url: string;
  isHomepage: boolean;
  createdByUserId: string;
}): Promise<PsiUrl> {
  const [row] = await db
    .insert(psiUrls)
    .values({ id: crypto.randomUUID(), ...input })
    .returning();
  if (!row) {
    throw new Error("Failed to insert psi_url");
  }
  return row;
}

async function deleteByIdForProject(
  id: string,
  projectId: string,
): Promise<void> {
  await db
    .delete(psiUrls)
    .where(and(eq(psiUrls.id, id), eq(psiUrls.projectId, projectId)));
}

async function countByProjectId(projectId: string): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(psiUrls)
    .where(eq(psiUrls.projectId, projectId));
  return rows[0]?.value ?? 0;
}

export const PagespeedUrlRepository = {
  listByProjectId,
  getByIdForProject,
  insert,
  deleteByIdForProject,
  countByProjectId,
};
