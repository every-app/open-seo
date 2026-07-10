import type {
  ArchiveProjectInput,
  CreateProjectInput,
  RestoreProjectInput,
  UpdateProjectInput,
} from "@/types/schemas/projects";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { AppError } from "@/server/lib/errors";
import {
  getKeywordDataProvider,
  getLanguageCode,
  getLanguageOptions,
} from "@/shared/keyword-locations";

function mapProject(project: {
  id: string;
  name: string;
  domain: string | null;
  locationCode: number;
  languageCode: string;
  createdAt: string;
}) {
  return {
    id: project.id,
    name: project.name,
    domain: project.domain,
    // Default market for the project's data calls (MCP tools and the web UI
    // fall back to these when a call omits locationCode/languageCode).
    locationCode: project.locationCode,
    languageCode: project.languageCode,
    createdAt: project.createdAt,
  };
}

/**
 * Resolves a partial market input into the columns to write. Changing the
 * location without a language snaps the language to the location's native
 * one; a language DataForSEO doesn't serve for the location is rejected here
 * (cost 0) instead of failing later as a charged provider error.
 *
 * A language-only change yields only the language column: echoing the
 * location from a pre-write read back into the update would let two
 * concurrent partial updates silently clobber each other's half.
 */
function resolveMarketInput(
  input: { locationCode?: number; languageCode?: string },
  current?: { locationCode: number; languageCode: string },
): { locationCode?: number; languageCode: string } | undefined {
  if (input.locationCode == null && input.languageCode == null) {
    return undefined;
  }
  const locationCode =
    input.locationCode ?? current?.locationCode ?? DEFAULT_PROJECT_LOCATION;
  const languageCode =
    input.languageCode ??
    (input.locationCode != null
      ? getLanguageCode(locationCode)
      : (current?.languageCode ?? getLanguageCode(locationCode)));
  if (
    getKeywordDataProvider(locationCode) === "labs" &&
    !getLanguageOptions(locationCode).some(
      (option) => option.code === languageCode,
    )
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Language '${languageCode}' is not available for this location. Available: ${getLanguageOptions(
        locationCode,
      )
        .map((option) => option.code)
        .join(", ")}.`,
    );
  }
  return input.locationCode != null
    ? { locationCode, languageCode }
    : { languageCode };
}

const DEFAULT_PROJECT_LOCATION = 2840;

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
      resolveMarketInput(input),
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
  let market: { locationCode?: number; languageCode: string } | undefined;
  if (input.locationCode != null || input.languageCode != null) {
    let current: { locationCode: number; languageCode: string } | undefined;
    if (input.locationCode == null) {
      // A language-only change is validated against the project's stored
      // location; a location change carries everything it needs in the input.
      current = await ProjectRepository.getProjectForOrganization(
        input.projectId,
        organizationId,
      );
      if (!current) {
        throw new AppError("NOT_FOUND");
      }
    }
    market = resolveMarketInput(input, current);
  }
  try {
    const row = await ProjectRepository.updateProject(
      input.projectId,
      organizationId,
      { name: input.name, domain: input.domain, market },
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
