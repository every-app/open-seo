import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { AppError } from "@/server/lib/errors";

async function listProjects(organizationId: string) {
  return db.query.projects.findMany({
    where: eq(projects.organizationId, organizationId),
    orderBy: desc(projects.createdAt),
  });
}

async function getProjectForOrganization(
  projectId: string,
  organizationId: string,
) {
  return db.query.projects.findFirst({
    where: and(
      eq(projects.id, projectId),
      eq(projects.organizationId, organizationId),
    ),
  });
}

async function getProjectById(projectId: string) {
  return db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });
}

async function getProjectPsiApiKey(projectId: string) {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    columns: { pagespeedApiKey: true },
  });
  return project?.pagespeedApiKey ?? null;
}

async function setProjectPsiApiKey(projectId: string, apiKey: string) {
  await db
    .update(projects)
    .set({ pagespeedApiKey: apiKey })
    .where(eq(projects.id, projectId));
}

async function clearProjectPsiApiKey(projectId: string) {
  await db
    .update(projects)
    .set({ pagespeedApiKey: null })
    .where(eq(projects.id, projectId));
}

async function createProject(
  organizationId: string,
  name: string,
  domain?: string,
) {
  const id = crypto.randomUUID();
  await db.insert(projects).values({
    id,
    organizationId,
    name,
    domain,
  });
  return id;
}

async function deleteProject(projectId: string, organizationId: string) {
  const project = await getProjectForOrganization(projectId, organizationId);
  if (!project) {
    throw new AppError("NOT_FOUND");
  }

  await db
    .delete(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.organizationId, organizationId),
      ),
    );
}

export const ProjectRepository = {
  listProjects,
  getProjectForOrganization,
  getProjectById,
  getProjectPsiApiKey,
  setProjectPsiApiKey,
  clearProjectPsiApiKey,
  createProject,
  deleteProject,
} as const;
