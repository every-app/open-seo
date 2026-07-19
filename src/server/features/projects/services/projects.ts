import type {
  ArchiveProjectInput,
  CreateProjectInput,
  RestoreProjectInput,
  SetProjectDomainInput,
  SetProjectMarketInput,
  UpdateProjectInput,
} from "@/types/schemas/projects";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { normalizeBacklinksTarget } from "@/server/lib/dataforseoBacklinksTarget";
import { AppError } from "@/server/lib/errors";
import { assertLanguageForLocation } from "@/server/lib/market";
import { getLanguageCode } from "@/shared/keyword-locations";

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
 * Resolves a market input into the columns to write. A location with no
 * language snaps to that location's native language; the schemas forbid the
 * reverse, so the pair is always resolvable without reading the stored row.
 */
function resolveMarketInput(input: {
  locationCode?: number;
  languageCode?: string;
}): { locationCode: number; languageCode: string } | undefined {
  if (input.locationCode == null) return undefined;
  const locationCode = input.locationCode;
  const languageCode = input.languageCode ?? getLanguageCode(locationCode);
  assertLanguageForLocation(locationCode, languageCode);
  return { locationCode, languageCode };
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

/**
 * Validates and canonicalizes a project domain (lowercase bare host, www and
 * protocol/path stripped) with the same rules the backlink fetch will apply
 * later, so junk fails at save time instead of at the first paid call.
 * Undefined passes through — updateProject uses that to clear the domain.
 */
function normalizeProjectDomain(domain: string | undefined) {
  if (domain === undefined) return undefined;
  try {
    return normalizeBacklinksTarget(domain, { scope: "domain" }).apiTarget;
  } catch {
    throw new AppError(
      "VALIDATION_ERROR",
      "Enter a valid domain, like acme.com.",
    );
  }
}

export async function createProject(
  organizationId: string,
  input: CreateProjectInput,
) {
  try {
    const row = await ProjectRepository.createProject(
      organizationId,
      input.name,
      normalizeProjectDomain(input.domain),
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
  try {
    const row = await ProjectRepository.updateProject(
      input.projectId,
      organizationId,
      {
        name: input.name,
        domain: normalizeProjectDomain(input.domain),
        market: resolveMarketInput(input),
      },
    );
    return mapProject(row);
  } catch (error) {
    if (isReservedDefaultConflict(error, input)) {
      throw new AppError("CONFLICT", RESERVED_DEFAULT_MESSAGE);
    }
    throw error;
  }
}

/**
 * Sets a project's domain on its own, for the dashboard hero's inline input.
 * Writing just this column keeps the write from echoing a name/market the
 * caller never edited.
 */
export async function setProjectDomain(
  organizationId: string,
  input: SetProjectDomainInput,
) {
  const domain = normalizeProjectDomain(input.domain);
  if (domain === undefined) {
    throw new AppError("VALIDATION_ERROR", "Enter a valid domain.");
  }
  const row = await ProjectRepository.updateProjectDomain(
    input.projectId,
    organizationId,
    domain,
  );
  return mapProject(row);
}

/**
 * Sets a project's default market on its own, for surfaces that only ask for
 * the market (onboarding). Writing just these two columns keeps the write from
 * echoing a name/domain the caller never edited.
 */
export async function setProjectMarket(
  organizationId: string,
  input: SetProjectMarketInput,
) {
  assertLanguageForLocation(input.locationCode, input.languageCode);
  const row = await ProjectRepository.updateProjectMarket(
    input.projectId,
    organizationId,
    { locationCode: input.locationCode, languageCode: input.languageCode },
  );
  return mapProject(row);
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
