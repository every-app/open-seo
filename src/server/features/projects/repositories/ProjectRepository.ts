import { and, count, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { AppError } from "@/server/lib/errors";

async function listProjects(organizationId: string) {
  return db.query.projects.findMany({
    where: and(
      eq(projects.organizationId, organizationId),
      isNull(projects.archivedAt),
    ),
    orderBy: [desc(projects.createdAt), desc(projects.id)],
  });
}

async function countProjects(organizationId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, organizationId),
        isNull(projects.archivedAt),
      ),
    );
  return row?.value ?? 0;
}

async function getProjectForOrganization(
  projectId: string,
  organizationId: string,
) {
  const [project] = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.organizationId, organizationId),
        isNull(projects.archivedAt),
      ),
    )
    .limit(1);
  return project ?? null;
}

// Look up a project by id alone (no org scoping). Only for trusted server
// contexts that have already authorized access another way — e.g. the
// onboarding chat Durable Object, whose connections are authorized in the
// Worker before they reach the DO, and which derives its org from the project.
async function getProjectById(projectId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.archivedAt)))
    .limit(1);
  return project ?? null;
}

async function createProject(
  organizationId: string,
  name: string,
  domain?: string,
) {
  const id = crypto.randomUUID();
  const [row] = await db
    .insert(projects)
    .values({ id, organizationId, name, domain })
    .returning();
  return row;
}

async function updateProject(
  projectId: string,
  organizationId: string,
  input: { name: string; domain?: string },
) {
  const [row] = await db
    .update(projects)
    .set({ name: input.name, domain: input.domain ?? null })
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.organizationId, organizationId),
      ),
    )
    .returning();

  if (!row) {
    throw new AppError("NOT_FOUND");
  }

  return row;
}

async function tryCreateDefaultProject(organizationId: string) {
  const id = crypto.randomUUID();
  const inserted = await db
    .insert(projects)
    .values({
      id,
      organizationId,
      name: "Default",
      domain: null,
    })
    .onConflictDoNothing()
    .returning({ id: projects.id });
  return inserted.length > 0 ? id : null;
}

async function listArchivedProjects(organizationId: string) {
  return db.query.projects.findMany({
    where: and(
      eq(projects.organizationId, organizationId),
      isNotNull(projects.archivedAt),
    ),
    orderBy: [desc(projects.archivedAt), desc(projects.id)],
  });
}

async function restoreProject(projectId: string, organizationId: string) {
  const [row] = await db
    .update(projects)
    .set({ archivedAt: null })
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.organizationId, organizationId),
        isNotNull(projects.archivedAt),
      ),
    )
    .returning({ id: projects.id });

  if (!row) {
    throw new AppError("NOT_FOUND");
  }
}

async function archiveProject(projectId: string, organizationId: string) {
  const [row] = await db
    .update(projects)
    .set({ archivedAt: sql`(current_timestamp)` })
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.organizationId, organizationId),
        isNull(projects.archivedAt),
      ),
    )
    .returning({ id: projects.id });

  if (!row) {
    throw new AppError("NOT_FOUND");
  }
}

export const ProjectRepository = {
  listProjects,
  listArchivedProjects,
  countProjects,
  getProjectForOrganization,
  getProjectById,
  createProject,
  updateProject,
  tryCreateDefaultProject,
  archiveProject,
  restoreProject,
} as const;
