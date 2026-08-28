import { describe, expect, it } from "vitest";
import { PROMPT_EXPLORER_MODEL_VERSIONS } from "@/types/schemas/ai-search";
import { isAcceptedLlmModelName } from "./ai";

describe("isAcceptedLlmModelName", () => {
  // DataForSEO bills tasks that fail with `Invalid Field: 'model_name'`, so a
  // selectable version that isn't accepted would pay for a guaranteed-rejected
  // call the moment a user picks it.
  it("accepts every user-selectable Prompt Explorer model version", () => {
    for (const [slug, versions] of Object.entries(
      PROMPT_EXPLORER_MODEL_VERSIONS,
    )) {
      for (const version of versions) {
        expect(
          isAcceptedLlmModelName(
            slug as keyof typeof PROMPT_EXPLORER_MODEL_VERSIONS,
            version,
          ),
          `${slug}/${version} is selectable but not in ACCEPTED_LLM_MODEL_NAMES`,
        ).toBe(true);
      }
    }
  });
});
