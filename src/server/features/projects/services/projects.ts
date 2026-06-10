import type {
  ArchiveProjectInput,
  CreateProjectInput,
  RestoreProjectInput,
  UpdateProjectInput,
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

// The projects table's only unique index guards the auto-created ("Default",
// null) singleton. A UNIQUE violation while writing exactly that name/domain
// therefore means one already exists — gating on the input (not just the error
// string) keeps this from misclassifying any unrelated failure.
function isReservedDefaultConflict(
  error: unknown,
  input: { name: string; domain?: string },
) {
  return (
    input.name === "Default" &&
    !input.domain &&
    error instanceof Error &&
    error.message.includes("UNIQUE constraint failed")
  );
}

const RESERVED_DEFAULT_MESSAGE =
  'A project named "Default" with no domain already exists. Pick a different name or add a domain.';

export async function listProjects(organizationId: string) {
  const rows = await ProjectRepository.listProjects(organizationId);
  return rows.map(mapProject);
}

// Source of truth for "which projects does this org have", guaranteeing at least
// one. Count-based — never matches on the "Default" name — so renaming the last
// project does not cause a spurious second Default to be created on next visit.
export async function listProjectsEnsuringOne(organizationId: string) {
  const existing = await listProjects(organizationId);
  if (existing.length > 0) {
    return existing;
  }

  await ProjectRepository.tryCreateDefaultProject(organizationId);
  return listProjects(organizationId);
}

export async function createProject(
  organizationId: string,
  input: CreateProjectInput,
) {
  try {
    const row = await ProjectRepository.createProject(
      organizationId,
      input.name,
      input.domain,
    );
    return mapProject(row);
  } catch (error) {
    if (isReservedDefaultConflict(error, input)) {
      throw new AppError("CONFLICT", RESERVED_DEFAULT_MESSAGE);
    }
    throw error;
  }
}

export async function updateProject(
  organizationId: string,
  input: UpdateProjectInput,
) {
  try {
    const row = await ProjectRepository.updateProject(
      input.projectId,
      organizationId,
      { name: input.name, domain: input.domain },
    );
    return mapProject(row);
  } catch (error) {
    if (isReservedDefaultConflict(error, input)) {
      throw new AppError("CONFLICT", RESERVED_DEFAULT_MESSAGE);
    }
    throw error;
  }
}

export async function archiveProject(
  organizationId: string,
  input: ArchiveProjectInput,
) {
  const remaining = await ProjectRepository.countProjects(organizationId);
  if (remaining <= 1) {
    throw new AppError("CONFLICT", "You can't archive your only project.");
  }

  await ProjectRepository.archiveProject(input.projectId, organizationId);
  return { success: true };
}

export async function listArchivedProjects(organizationId: string) {
  const rows = await ProjectRepository.listArchivedProjects(organizationId);
  return rows.map(mapProject);
}

export async function restoreProject(
  organizationId: string,
  input: RestoreProjectInput,
) {
  try {
    await ProjectRepository.restoreProject(
      input.archivedProjectId,
      organizationId,
    );
  } catch (error) {
    // The Default singleton index is the only unique index on projects, and
    // restore only writes archived_at — so a UNIQUE failure can only mean an
    // active Default/no-domain project already exists.
    if (
      error instanceof Error &&
      error.message.includes("UNIQUE constraint failed")
    ) {
      throw new AppError(
        "CONFLICT",
        'An active project named "Default" with no domain already exists. Rename it first, then restore this one.',
      );
    }
    throw error;
  }
  return { success: true };
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
