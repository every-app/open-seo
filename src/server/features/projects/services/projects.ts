import type {
  CreateProjectInput,
  DeleteProjectInput,
} from "@/types/schemas/projects";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { AppError } from "@/server/lib/errors";

function mapProject(project: {
  id: string;
  name: string;
  domain: string | null;
  createdAt: string;
}) {
  return {
    id: project.id,
    name: project.name,
    domain: project.domain,
    createdAt: project.createdAt,
  };
}

export async function listProjects(organizationId: string) {
  const rows = await ProjectRepository.listProjects(organizationId);
  return rows.map(mapProject);
}

export async function createProject(
  organizationId: string,
  input: CreateProjectInput,
) {
  const id = await ProjectRepository.createProject(
    organizationId,
    input.name,
    input.domain,
  );
  return { id };
}

export async function deleteProject(
  organizationId: string,
  input: DeleteProjectInput,
) {
  await ProjectRepository.deleteProject(input.projectId, organizationId);
  return { success: true };
}

export async function getOrCreateDefaultProject(organizationId: string) {
  const existing =
    await ProjectRepository.getDefaultProjectForOrganization(organizationId);
  if (existing) {
    return mapProject(existing);
  }

  try {
    const id = await ProjectRepository.createProject(
      organizationId,
      "Default",
      undefined,
    );

    return {
      id,
      name: "Default",
      domain: null,
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    if (!isDefaultProjectUniqueConstraintError(error)) {
      throw error;
    }

    const createdProject =
      await ProjectRepository.getDefaultProjectForOrganization(organizationId);
    if (createdProject) {
      return mapProject(createdProject);
    }

    throw error;
  }
}

function isDefaultProjectUniqueConstraintError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("unique constraint failed") &&
    message.includes("projects.organization_id")
  );
}

export async function getProject(projectId: string) {
  const project = await ProjectRepository.getProjectById(projectId);
  if (!project) {
    throw new AppError("NOT_FOUND");
  }

  return mapProject(project);
}

export async function getProjectForOrganization(
  organizationId: string,
  projectId: string,
) {
  const project = await ProjectRepository.getProjectForOrganization(
    projectId,
    organizationId,
  );
  if (!project) {
    throw new AppError("NOT_FOUND");
  }

  return mapProject(project);
}
