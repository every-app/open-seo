import { env } from "cloudflare:workers";
import type { SamChatAgent } from "@/server/features/sam/SamChatAgent";
import { deleteProjectAiObjects } from "@/server/features/ai-visibility/services/aiVisibilityStorage";
import { DashboardCacheService } from "@/server/features/dashboard/services/DashboardCacheService";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { AppError } from "@/server/lib/errors";
import { deleteR2Prefix } from "@/server/lib/r2";
import type { ArchivedProjectInput } from "@/types/schemas/projects";

/**
 * Permanently deletes an archived project. The database rows go first, in one
 * cascading delete, so the project disappears even if a cleanup below fails.
 * The files and chat transcripts kept outside the database are then removed
 * best-effort. Audit scratchpads aren't listed: they self-destroy within 7
 * days and hold no more than the deleted audit rows did.
 */
export async function deleteArchivedProject(
  organizationId: string,
  input: ArchivedProjectInput,
) {
  const projectId = input.archivedProjectId;
  const samSessionIds = await ProjectRepository.deleteArchivedProject(
    projectId,
    organizationId,
  );
  if (!samSessionIds) throw new AppError("NOT_FOUND");

  const cleanups: Promise<unknown>[] = [
    deleteR2Prefix(env.R2, `site-audit/${projectId}/`),
    deleteProjectAiObjects(env.R2, projectId),
    DashboardCacheService.deleteGscCache(projectId),
  ];
  // env.d.ts declares the DO binding untyped; narrow so the RPC is typed.
  const samChat =
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the binding is declared as this class in wrangler.jsonc
    env.SAM_CHAT as unknown as DurableObjectNamespace<SamChatAgent>;
  for (const sessionId of samSessionIds) {
    cleanups.push(
      samChat.get(samChat.idFromName(sessionId)).destroyForErasure(),
    );
  }
  const results = await Promise.allSettled(cleanups);
  for (const result of results) {
    if (result.status === "rejected") {
      console.warn(
        `Failed to clean up deleted project ${projectId}:`,
        result.reason,
      );
    }
  }
  return { success: true };
}
