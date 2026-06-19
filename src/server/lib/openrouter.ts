import {
  createOpenRouter,
  type LanguageModelV3,
} from "@openrouter/ai-sdk-provider";
import {
  getOptionalEnvValue,
  getRequiredEnvValue,
} from "@/server/lib/runtime-env";

// OpenRouter model slug used for the onboarding chat. Override
// with OPENROUTER_MODEL to swap models without a code change.
const DEFAULT_ONBOARDING_MODEL = "anthropic/claude-sonnet-4.6";

/**
 * Returns the AI SDK LanguageModel for onboarding. `usage: { include: true }`
 * turns on OpenRouter usage accounting so each response carries its real USD
 * cost (providerMetadata.openrouter.usage.cost) — which we meter against the
 * shared usage-credit pool.
 */
export async function getOnboardingModel(): Promise<LanguageModelV3> {
  const apiKey = await getRequiredEnvValue("OPENROUTER_API_KEY");
  const modelId =
    (await getOptionalEnvValue("OPENROUTER_MODEL")) ?? DEFAULT_ONBOARDING_MODEL;
  return createOpenRouter({ apiKey })(modelId, { usage: { include: true } });
}
