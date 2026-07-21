import {
  createOpenRouter,
  type LanguageModelV3,
} from "@openrouter/ai-sdk-provider";
import {
  getOptionalEnvValue,
  getRequiredEnvValue,
} from "@/server/lib/runtime-env";

// OpenRouter model slug used for the in-app chat agents (onboarding + SAM).
// Override with OPENROUTER_MODEL to swap models without a code change.
const DEFAULT_CHAT_AGENT_MODEL = "minimax/minimax-m3";

/**
 * Returns the AI SDK LanguageModel for the chat agents. `usage: { include: true }`
 * turns on OpenRouter usage accounting so each response carries its real USD
 * cost (providerMetadata.openrouter.usage.cost) — which we meter against the
 * shared usage-credit pool. `provider.order` prefers Together, then Atlas
 * Cloud (fp8); `zdr: true` restricts routing to Zero-Data-Retention endpoints
 * (prompts are never retained), which is the actual constraint — it excludes
 * MiniMax first-party without a hand-maintained allowlist. The account also
 * enforces this ("Non-frontier requires ZDR" data policy); the request-level
 * flag is belt-and-braces so the constraint survives a dashboard change.
 * Fallbacks stay on within the ZDR set because pinning providers caused a
 * prod outage (Jul 2026: Together upstream-rate-limited m3 and every chat
 * turn 429'd); as of Jul 2026 the ZDR set for m3 is Together/AtlasCloud/
 * Novita/Parasail at the same price plus Morph at 2x output as a last resort.
 *
 * `reasoning` turns on OpenRouter's reasoning-token channel so the model's
 * chain-of-thought comes back as a separate reasoning stream instead of
 * leaking into the visible answer text (MiniMax M3 otherwise dumps its
 * `<think>` trace inline). `effort: "medium"` is OpenRouter's default —
 * stated explicitly only because the SDK type requires one once the channel
 * is configured.
 */
export async function getChatAgentModel(): Promise<LanguageModelV3> {
  const baseURL = await getOptionalEnvValue("CHAT_BASE_URL");
  // A self-hosted / OpenAI-compatible endpoint (CHAT_BASE_URL) usually needs no
  // key; OpenRouter still requires one.
  const apiKey = baseURL
    ? ((await getOptionalEnvValue("OPENROUTER_API_KEY")) ?? "")
    : await getRequiredEnvValue("OPENROUTER_API_KEY");
  const modelId = await getOptionalEnvValue("OPENROUTER_MODEL");
  return buildChatAgentModel(apiKey, modelId, baseURL);
}

/**
 * Synchronous variant for callers that already hold the env values. Think's
 * `getModel()` hook is sync and runs on every turn, so the SAM agent reads the
 * key/model from its DO env and builds the model here.
 *
 * When `baseURL` (CHAT_BASE_URL) is set, the model is served from a self-hosted,
 * OpenAI-compatible endpoint (vLLM, Ollama, LiteLLM, …). In that mode we point
 * the provider at the custom base URL and drop the OpenRouter-only request
 * options (usage accounting, provider routing/ZDR, the reasoning channel) that
 * a generic endpoint doesn't understand — cost metering then falls back to 0
 * because there's no OpenRouter usage metadata to read. The API key is optional
 * for local endpoints; a placeholder is sent so the SDK still builds an auth
 * header (vLLM/Ollama ignore it).
 */
export function buildChatAgentModel(
  apiKey: string,
  modelId?: string,
  baseURL?: string,
): LanguageModelV3 {
  const model = modelId ?? DEFAULT_CHAT_AGENT_MODEL;
  if (baseURL) {
    return createOpenRouter({ apiKey: apiKey || "local", baseURL })(model);
  }
  return createOpenRouter({ apiKey })(model, {
    usage: { include: true },
    reasoning: { effort: "medium" },
    provider: {
      order: ["together", "atlas-cloud/fp8"],
      zdr: true,
      allow_fallbacks: true,
    },
  });
}
