import { and, asc, count, eq, isNull, lte, or } from "drizzle-orm";
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
  return rows.toSorted((a, b) => Number(b.isHomepage) - Number(a.isHomepage));
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
}): Promise<PsiUrl | null> {
  // The homepage is seeded lazily on read, so two concurrent overview loads
  // can race for the same (projectId, url). Losing that race is not an error
  // — the row the winner wrote is the one we wanted.
  const [row] = await db
    .insert(psiUrls)
    .values({ id: crypto.randomUUID(), ...input })
    .onConflictDoNothing({ target: [psiUrls.projectId, psiUrls.url] })
    .returning();
  return row ?? null;
}

async function deleteByIdForProject(
  id: string,
  projectId: string,
): Promise<void> {
  await db
    .delete(psiUrls)
    .where(and(eq(psiUrls.id, id), eq(psiUrls.projectId, projectId)));
}

/**
 * Every monitored URL due for a scheduled run, across all projects. Paused
 * URLs are excluded here rather than skipped later, so a paused URL costs
 * nothing per tick. A null `nextRunAt` means the URL predates the sweep or was
 * just added, and is due immediately. Ordered by due time so the
 * oldest-waiting URLs go first if a tick only gets through part of the
 * backlog.
 */
async function listDueForSweep(nowIso: string): Promise<PsiUrl[]> {
  return db
    .select()
    .from(psiUrls)
    .where(
      and(
        eq(psiUrls.scheduleEnabled, true),
        or(isNull(psiUrls.nextRunAt), lte(psiUrls.nextRunAt, nowIso)),
      ),
    )
    .orderBy(asc(psiUrls.nextRunAt));
}

/** Advance a URL's schedule. Called before the run starts, so a crash or a
 *  failing URL cannot leave it permanently due and retrying every tick. */
async function updateNextRunAt(id: string, nextRunAt: string): Promise<void> {
  await db.update(psiUrls).set({ nextRunAt }).where(eq(psiUrls.id, id));
}

/** Pause or resume automatic runs for one URL. */
async function setScheduleEnabled(
  id: string,
  projectId: string,
  enabled: boolean,
): Promise<void> {
  await db
    .update(psiUrls)
    .set({ scheduleEnabled: enabled })
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
  listDueForSweep,
  updateNextRunAt,
  setScheduleEnabled,
};
