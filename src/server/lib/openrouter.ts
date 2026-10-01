import {
  createOpenRouter,
  type LanguageModelV3,
} from "@openrouter/ai-sdk-provider";
import { getEnvValueSync } from "@/server/lib/runtime-env";

// OpenRouter model slug used for the SAM in-app chat agent. Override with
// OPENROUTER_MODEL to swap models without a code change.
const DEFAULT_CHAT_AGENT_MODEL = "openai/gpt-5.6-luna";

// Previous default; kept reachable via OPENROUTER_MODEL for rollback. Its
// routing needs the ZDR/provider tuning below.
const MINIMAX_M3 = "minimax/minimax-m3";

/**
 * Returns the AI SDK LanguageModel for the chat agent. `usage: { include: true }`
 * turns on OpenRouter usage accounting so each response carries its real USD
 * cost (providerMetadata.openrouter.usage.cost) — which we meter against the
 * shared usage-credit pool.
 *
 * Default model: GPT-5.6 Luna at `reasoning.effort: "max"` — "max" is valid at
 * the OpenRouter API for GPT-5.x but missing from the SDK's effort union, so
 * the reasoning config rides in `extraBody`. Reasoning tokens stream on the
 * separate reasoning channel and are billed as output tokens, which the usage
 * accounting above captures.
 *
 * Sync on purpose: Think's `getModel()` hook is sync and runs on every turn,
 * so the SAM agent reads the key/model from its DO env and builds here.
 */
export function buildChatAgentModel(
  apiKey: string,
  modelId?: string,
  reasoningEffort: "max" | "low" = "max",
  baseURL?: string,
): LanguageModelV3 {
  const model = modelId ?? DEFAULT_CHAT_AGENT_MODEL;
  // Optional custom endpoint: any OpenAI-compatible API (self-hosted
  // alternatives, gateways, proxies). Defaults to openrouter.ai when unset.
  const openrouter = createOpenRouter({ apiKey, ...(baseURL && { baseURL }) });

  // MiniMax M3 (env-override path only): `provider.order` prefers Together,
  // then Atlas Cloud (fp8); `zdr: true` restricts routing to Zero-Data-
  // Retention endpoints, which excludes MiniMax first-party — the account's
  // "Non-frontier requires ZDR" data policy enforces the same, this flag is
  // belt-and-braces. Fallbacks stay on within the ZDR set because pinning
  // providers caused a prod outage (Jul 2026: Together upstream-rate-limited
  // m3 and every chat turn 429'd). The explicit reasoning channel keeps m3's
  // `<think>` trace out of the visible answer text.
  if (model === MINIMAX_M3) {
    return openrouter(model, {
      usage: { include: true },
      reasoning: { effort: reasoningEffort === "low" ? "low" : "medium" },
      provider: {
        order: ["together", "atlas-cloud/fp8"],
        zdr: true,
        allow_fallbacks: true,
      },
    });
  }

  // Custom endpoints may not implement OpenRouter usage accounting or the
  // `reasoning` body param — skip both and send a plain request instead.
  if (baseURL) {
    return openrouter(model);
  }

  return openrouter(model, {
    usage: { include: true },
    extraBody: { reasoning: { effort: reasoningEffort } },
  });
}

/**
 * Builds the chat agent model from an env record (the SAM agent's DO env):
 * OPENROUTER_API_KEY (required), plus the optional OPENROUTER_MODEL and
 * OPENROUTER_BASE_URL overrides.
 */
export function buildChatAgentModelFromEnv(
  env: object,
  reasoningEffort: "max" | "low" = "max",
): LanguageModelV3 {
  const apiKey = getEnvValueSync(env, "OPENROUTER_API_KEY");
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is required for the SAM agent");
  }
  return buildChatAgentModel(
    apiKey,
    getEnvValueSync(env, "OPENROUTER_MODEL"),
    reasoningEffort,
    getEnvValueSync(env, "OPENROUTER_BASE_URL"),
  );
}
