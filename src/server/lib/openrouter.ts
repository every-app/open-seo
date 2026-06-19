import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import {
  getOptionalEnvValue,
  getRequiredEnvValue,
} from "@/server/lib/runtime-env";

// OpenRouter model slug used for onboarding strategy synthesis + chat. Override
// with OPENROUTER_MODEL to swap models without a code change.
const DEFAULT_ONBOARDING_MODEL = "anthropic/claude-sonnet-4.6";

/** Returns the AI SDK LanguageModel for onboarding, wired through OpenRouter. */
export async function getOnboardingModel(): Promise<LanguageModel> {
  const apiKey = await getRequiredEnvValue("OPENROUTER_API_KEY");
  const model =
    (await getOptionalEnvValue("OPENROUTER_MODEL")) ?? DEFAULT_ONBOARDING_MODEL;
  return createOpenRouter({ apiKey })(model);
}
