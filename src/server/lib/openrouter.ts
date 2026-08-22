import type { LanguageModel } from "ai";
import { AiProviderRegistry } from "@/server/features/ai/providers";
import {
  getOptionalEnvValue,
  getRequiredEnvValue,
} from "@/server/lib/runtime-env";

// Compatibility shim for callers that predate the multi-provider registry
// (the onboarding chat agent). The OpenRouter adapter in providers.ts owns
// the model construction; these helpers keep the old names working.

/**
 * Returns the AI SDK LanguageModel for the chat agents. `usage: { include: true }`
 * turns on OpenRouter usage accounting so each response carries its real USD
 * cost (providerMetadata.openrouter.usage.cost) — which we meter against the
 * shared usage-credit pool. `provider.order` prefers Together, then Atlas
 * Cloud (fp8); `zdr: true` restricts routing to Zero-Data-Retention endpoints
 * (prompts are never retained); fallbacks stay on within the ZDR set because
 * pinning providers caused a prod outage (Jul 2026). `reasoning` keeps
 * chain-of-thought on a separate reasoning stream instead of leaking into the
 * visible answer text.
 */
export async function getChatAgentModel(): Promise<LanguageModel> {
  const apiKey = await getRequiredEnvValue("OPENROUTER_API_KEY");
  const modelId = await getOptionalEnvValue("OPENROUTER_MODEL");
  return buildChatAgentModel(apiKey, modelId);
}

/**
 * Synchronous variant for callers that already hold the env values. Think's
 * `getModel()` hook is sync and runs on every turn.
 */
export function buildChatAgentModel(
  apiKey: string,
  modelId?: string,
): LanguageModel {
  const openRouter = AiProviderRegistry.get("openrouter");
  return openRouter.buildModel(apiKey, modelId ?? openRouter.defaultModelId);
}