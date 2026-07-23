import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  requireAuthenticatedContext,
  requireProjectContext,
} from "@/serverFunctions/middleware";
import { AppError } from "@/server/lib/errors";
import type { SamSessionRepository as SamSessionRepositoryType } from "@/server/features/sam/SamSessionRepository";
import type { ProjectRepository as ProjectRepositoryType } from "@/server/features/projects/repositories/ProjectRepository";

async function loadSamRepositories(): Promise<{
  SamSessionRepository: typeof SamSessionRepositoryType;
  ProjectRepository: typeof ProjectRepositoryType;
}> {
  const samSessionRepositorySpecifier =
    "@/server/features/sam/SamSessionRepository";
  const projectRepositorySpecifier =
    "@/server/features/projects/repositories/ProjectRepository";

  const [{ SamSessionRepository }, { ProjectRepository }] = await Promise.all([
    import(/* @vite-ignore */ samSessionRepositorySpecifier),
    import(/* @vite-ignore */ projectRepositorySpecifier),
  ]);

  return { SamSessionRepository, ProjectRepository };
}

// The ensure-user middleware authorizes `projectId` against the caller's org
// (ADR 0001); requireProjectContext exposes the verified project.
const projectScopedSchema = z.object({ projectId: z.string().min(1) });

// Lists the SAM chat sessions for a project (newest first) for the side-panel.
export const listSamSessions = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    const { SamSessionRepository } = await loadSamRepositories();
    return SamSessionRepository.listSessionsForProject(
      context.projectId,
      context.userId,
    );
  });

// Creates a new SAM chat session and returns its id; the client then opens a DO
// connection keyed by that id.
export const createSamSession = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    const { SamSessionRepository } = await loadSamRepositories();
    const session = await SamSessionRepository.createSession({
      projectId: context.projectId,
      userId: context.userId,
    });
    if (!session) {
      throw new AppError("INTERNAL_ERROR", "Failed to create chat session");
    }
    return { id: session.id };
  });

const archiveSchema = z.object({ sessionId: z.string().min(1) });

// Archives a SAM chat session: it disappears from the list and can no longer
// be opened, but the registry row and the DO's transcript are kept so a future
// unarchive can restore it. There is no unarchive UI yet.
export const archiveSamSession = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(archiveSchema)
  .handler(async ({ data, context }) => {
    const { SamSessionRepository, ProjectRepository } =
      await loadSamRepositories();
    // Authorize against the session's project (the canonical project-access
    // path), not the caller's org directly.
    const session = await SamSessionRepository.getActiveSession(
      data.sessionId,
      context.userId,
    );
    const project = session
      ? await ProjectRepository.getProjectForOrganization(
          session.projectId,
          context.organizationId,
        )
      : null;
    if (!session || !project) {
      throw new AppError("NOT_FOUND", "Chat session not found");
    }
    await SamSessionRepository.archiveSession(data.sessionId);
    return { ok: true };
  });
