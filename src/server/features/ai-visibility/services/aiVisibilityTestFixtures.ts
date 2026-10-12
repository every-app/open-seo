import type { AiTrackerPatch } from "@/types/schemas/ai-visibility";
import { projectAiConfiguration } from "./aiVisibilityConfiguration";

export const customer = {
  organizationId: "organization",
  userId: "user",
  userEmail: "user@example.com",
};

/** A new tracker for `project` with the given patch applied. */
export function configuration(
  patch: AiTrackerPatch = {
    engines: ["chatgpt"],
    prompts: [{ text: "Which SEO tools?" }],
  },
  projectId = "project",
) {
  return projectAiConfiguration({
    previous: null,
    projectId,
    projectMarket: { locationCode: 2840, languageCode: "en" },
    patch,
    now: "2026-09-05T12:00:00.000Z",
  }).rows;
}
