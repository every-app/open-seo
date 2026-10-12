import {
  AiVisibilityRepository as repo,
  type ConfigurationRows,
} from "../repositories/AiVisibilityRepository";
import { AiVisibilityError } from "./aiVisibilityErrors";
import type { AiTrackerPatch } from "@/types/schemas/ai-visibility";
import { projectAiConfiguration } from "./aiVisibilityConfiguration";

export async function requireConfiguration(projectId: string) {
  const config = await repo.getConfiguration(projectId);
  if (!config)
    throw new AiVisibilityError(
      "TRACKER_REQUIRED",
      "Save prompts with save_ai_visibility_tracker before starting collection.",
    );
  return config;
}

/** Applies a patch to the saved tracker, or to a new one in the project's market. */
export async function projectPatch(
  projectId: string,
  patch: AiTrackerPatch,
  previous: ConfigurationRows | null,
) {
  const project = await repo.getProject(projectId);
  if (!project)
    throw new AiVisibilityError(
      "PROJECT_NOT_FOUND",
      "The selected project is not available.",
    );
  if (!project.domain)
    throw new AiVisibilityError(
      "BRAND_REQUIRED",
      "Set your project's website before configuring or running AI tracking.",
    );
  return projectAiConfiguration({
    previous,
    projectId,
    projectMarket: {
      locationCode: project.locationCode,
      languageCode: project.languageCode,
    },
    patch,
    now: new Date().toISOString(),
  });
}
