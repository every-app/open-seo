import type {
  CreateProjectInput,
  DeleteProjectInput,
} from "@/types/schemas/keywords";
import { KeywordResearchRepository } from "@/server/features/keywords/repositories/KeywordResearchRepository";

export async function listProjects(userId: string) {
  const rows = await KeywordResearchRepository.listProjects(userId);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    domain: row.domain,
    createdAt: row.createdAt,
  }));
}

export async function createProject(userId: string, input: CreateProjectInput) {
  const id = await KeywordResearchRepository.createProject(
    userId,
    input.name,
    input.domain,
  );
  return { id };
}

export async function deleteProject(userId: string, input: DeleteProjectInput) {
  await KeywordResearchRepository.deleteProject(input.projectId, userId);
  return { success: true };
}

export async function getOrCreateDefaultProject(userId: string) {
  const existing = await KeywordResearchRepository.listProjects(userId);
  if (existing.length > 0) {
    const first = existing[0];
    return {
      id: first.id,
      name: first.name,
      domain: first.domain,
      createdAt: first.createdAt,
    };
  }

  const id = await KeywordResearchRepository.createProject(
    userId,
    "Default",
    undefined,
  );
  return {
    id,
    name: "Default",
    domain: null,
    createdAt: new Date().toISOString(),
  };
}

export async function getProject(userId: string, projectId: string) {
  const project = await KeywordResearchRepository.getProject(projectId, userId);
  if (!project) return null;
  return {
    id: project.id,
    name: project.name,
    domain: project.domain,
    createdAt: project.createdAt,
  };
}
