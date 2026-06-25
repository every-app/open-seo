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
const DEFAULT_ONBOARDING_MODEL = "minimax/minimax-m3";

/**
 * Returns the AI SDK LanguageModel for onboarding. `usage: { include: true }`
 * turns on OpenRouter usage accounting so each response carries its real USD
 * cost (providerMetadata.openrouter.usage.cost) — which we meter against the
 * shared usage-credit pool. `provider.order` pins routing to Together first,
 * falling back to Atlas Cloud (fp8); `allow_fallbacks: false` keeps routing to
 * exactly those two so we get consistent behavior/pricing for the model.
 *
 * `reasoning` turns on OpenRouter's reasoning-token channel so the model's
 * chain-of-thought comes back as a separate reasoning stream instead of
 * leaking into the visible answer text (MiniMax M3 otherwise dumps its
 * `<think>` trace inline). `effort: "low"` keeps the trace — and its billable
 * tokens — short for the onboarding preview while still giving the UI a
 * "thinking" stream to show.
 */
export async function getOnboardingModel(): Promise<LanguageModelV3> {
  const apiKey = await getRequiredEnvValue("OPENROUTER_API_KEY");
  const modelId =
    (await getOptionalEnvValue("OPENROUTER_MODEL")) ?? DEFAULT_ONBOARDING_MODEL;
  return createOpenRouter({ apiKey })(modelId, {
    usage: { include: true },
    reasoning: { effort: "low" },
    provider: {
      order: ["together", "atlas-cloud/fp8"],
      allow_fallbacks: false,
    },
  });
}
