import { KeywordResearchRepository } from "@/server/features/keywords/repositories/KeywordResearchRepository";
import { AppError } from "@/server/lib/errors";

export async function assertBacklinksProjectAccess(
  userId: string,
  projectId: string,
) {
  const project = await KeywordResearchRepository.getProject(projectId, userId);
  if (!project) {
    throw new AppError("NOT_FOUND");
  }

  return project;
}
