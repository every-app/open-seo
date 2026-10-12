import { AiVisibilityRepository as repo } from "../repositories/AiVisibilityRepository";
import type { SaveAiTrackerInput } from "@/types/schemas/ai-visibility";
import { projectPatch } from "./aiVisibilityMutation";
import { getTracker } from "./aiVisibilityState";

/** Creates or edits tracking. A new tracker starts weekly, first check a week out. */
export async function saveTracker(input: SaveAiTrackerInput) {
  const { projectId, ...patch } = input;
  const current = await repo.getConfiguration(projectId);
  const { rows, created, updated, skipped } = await projectPatch(
    projectId,
    patch,
    current,
  );
  await repo.saveConfiguration(rows);
  return { state: await getTracker({ projectId }), created, updated, skipped };
}
