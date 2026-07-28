import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  createOpenRouter,
  type LanguageModelV3,
} from "@openrouter/ai-sdk-provider";
import { getEnvValueSync, getOptionalEnvValue } from "@/server/lib/runtime-env";

// Model slug used for the in-app chat agents (onboarding + SAM). OpenRouter and
// the OpenAI-compatible gateways below publish the same `vendor/model` slugs, so
// this default resolves on both. Override with OPENROUTER_MODEL / LLM_MODEL to
// swap models without a code change.
const DEFAULT_CHAT_AGENT_MODEL = "minimax/minimax-m3";

// Endpoint used when LLM_API_KEY is set without LLM_BASE_URL: LLMTR, a hosted
// gateway that serves the same catalog over /v1/chat/completions. Point
// LLM_BASE_URL at any other OpenAI-compatible endpoint (another gateway, a
// self-hosted vLLM, Ollama) to use that instead.
const DEFAULT_LLM_BASE_URL = "https://llmtr.com/v1";

const PROVIDER_ENV_NAMES = [
  "LLM_API_KEY",
  "LLM_BASE_URL",
  "LLM_MODEL",
  "OPENROUTER_API_KEY",
  "OPENROUTER_MODEL",
] as const;

type ProviderEnvName = (typeof PROVIDER_ENV_NAMES)[number];

/**
 * Which LLM endpoint the chat agents talk to. `openrouter` is the original path
 * and stays the default; `openai-compatible` covers every deployment that would
 * rather not route through OpenRouter — LLMTR by default, or any endpoint that
 * speaks the OpenAI chat-completions API.
 */
type ChatAgentProvider =
  | { kind: "openrouter"; apiKey: string; modelId: string }
  | {
      kind: "openai-compatible";
      apiKey: string;
      baseUrl: string;
      modelId: string;
    };

export const CHAT_AGENT_KEY_MISSING_MESSAGE =
  "Neither OPENROUTER_API_KEY nor LLM_API_KEY is set for this deployment yet. Add one to your environment, restart OpenSEO, then confirm here.";

const MISSING_CREDENTIALS_ERROR =
  "Missing chat agent credentials: set OPENROUTER_API_KEY, or LLM_API_KEY for an OpenAI-compatible gateway";

/**
 * Pick the provider from environment values. LLM_API_KEY wins when both are set,
 * so a deployment can leave a stale OPENROUTER_API_KEY in place while switching.
 * Returns null when neither key is configured — AI features are optional, and
 * the callers turn that into a setup gate rather than an error.
 */
function resolveProvider(
  read: (name: ProviderEnvName) => string | undefined,
): ChatAgentProvider | null {
  const gatewayKey = read("LLM_API_KEY");
  if (gatewayKey) {
    return {
      kind: "openai-compatible",
      apiKey: gatewayKey,
      baseUrl: read("LLM_BASE_URL") ?? DEFAULT_LLM_BASE_URL,
      modelId: read("LLM_MODEL") ?? DEFAULT_CHAT_AGENT_MODEL,
    };
  }

  const openRouterKey = read("OPENROUTER_API_KEY");
  if (!openRouterKey) return null;
  return {
    kind: "openrouter",
    apiKey: openRouterKey,
    modelId: read("OPENROUTER_MODEL") ?? DEFAULT_CHAT_AGENT_MODEL,
  };
}

/**
 * Sync variant for callers that already hold an env record — Think's `getModel()`
 * hook is sync and runs on every turn, so the SAM agent resolves from its DO env.
 */
export function resolveChatAgentProvider(
  env: object,
): ChatAgentProvider | null {
  return resolveProvider((name) => getEnvValueSync(env, name));
}

export function requireChatAgentProvider(env: object): ChatAgentProvider {
  const provider = resolveChatAgentProvider(env);
  if (!provider) throw new Error(MISSING_CREDENTIALS_ERROR);
  return provider;
}

export async function loadChatAgentProvider(): Promise<ChatAgentProvider> {
  const entries = await Promise.all(
    PROVIDER_ENV_NAMES.map(
      async (name) => [name, await getOptionalEnvValue(name)] as const,
    ),
  );
  const values = new Map(entries);
  const provider = resolveProvider((name) => values.get(name));
  if (!provider) throw new Error(MISSING_CREDENTIALS_ERROR);
  return provider;
}

/**
 * OpenRouter path: `usage: { include: true }` turns on OpenRouter usage
 * accounting so each response carries its real USD cost
 * (providerMetadata.openrouter.usage.cost) — which we meter against the shared
 * usage-credit pool. `provider.order` prefers Together, then Atlas Cloud (fp8);
 * `zdr: true` restricts routing to Zero-Data-Retention endpoints (prompts are
 * never retained), which is the actual constraint — it excludes MiniMax
 * first-party without a hand-maintained allowlist. The account also enforces
 * this ("Non-frontier requires ZDR" data policy); the request-level flag is
 * belt-and-braces so the constraint survives a dashboard change. Fallbacks stay
 * on within the ZDR set because pinning providers caused a prod outage (Jul
 * 2026: Together upstream-rate-limited m3 and every chat turn 429'd); as of Jul
 * 2026 the ZDR set for m3 is Together/AtlasCloud/Novita/Parasail at the same
 * price plus Morph at 2x output as a last resort.
 *
 * `reasoning` turns on OpenRouter's reasoning-token channel so the model's
 * chain-of-thought comes back as a separate reasoning stream instead of leaking
 * into the visible answer text (MiniMax M3 otherwise dumps its `<think>` trace
 * inline). `effort: "medium"` is OpenRouter's default — stated explicitly only
 * because the SDK type requires one once the channel is configured.
 *
 * OpenAI-compatible path: none of the above is portable, so the request stays
 * plain chat-completions — routing and data retention are whatever the endpoint
 * gives you, and reasoning comes back only if it emits `reasoning_content`
 * (which the provider maps onto the same reasoning stream). `includeUsage` asks
 * for the token counts in the stream; cost is not part of that API, so these
 * deployments meter no LLM spend (see openRouterCostUsd) — fine for self-hosting
 * against your own key, which is what this path is for.
 */
export function buildChatAgentModel(
  provider: ChatAgentProvider,
): LanguageModelV3 {
  if (provider.kind === "openai-compatible") {
    return createOpenAICompatible({
      name: "llm-gateway",
      baseURL: provider.baseUrl,
      apiKey: provider.apiKey,
      includeUsage: true,
    }).chatModel(provider.modelId);
  }

  return createOpenRouter({ apiKey: provider.apiKey })(provider.modelId, {
    usage: { include: true },
    reasoning: { effort: "medium" },
    provider: {
      order: ["together", "atlas-cloud/fp8"],
      zdr: true,
      allow_fallbacks: true,
    },
  });
}
