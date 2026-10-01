import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { extractReasoningMiddleware, wrapLanguageModel } from "ai";
import { buildChatAgentModel } from "@/server/lib/openrouter";
import { getEnvValueSync } from "@/server/lib/runtime-env";

/**
 * SAM's model. A self-hoster's own OpenAI-compatible server (vLLM, llama.cpp,
 * Ollama, LM Studio, a gateway) set with CHAT_BASE_URL takes precedence over
 * OpenRouter. It has no reasoning-effort knob, and its responses carry no
 * OpenRouter cost, so nothing is metered.
 *
 * That path uses the generic OpenAI-compatible provider, not the OpenRouter
 * one: the OpenRouter SDK's stream schema rejects the `delta.role: null` some
 * servers send on tool-call chunks, so every tool turn fails, and it only
 * reads OpenRouter's own reasoning fields, so `reasoning_content` is dropped.
 *
 * Reasoning models served without a reasoning parser return their chain of
 * thought inline as `<think>…</think>answer`. The middleware moves it to the
 * reasoning channel, so the chat shows it in the collapsible thinking block
 * instead of as the reply. When the chat template opens `<think>` itself (vLLM
 * without --reasoning-parser) only the closing tag comes back, which
 * CHAT_PREFILLED_THINK covers. It is opt-in because it treats a reply with no
 * closing tag as thinking, which would blank a model's thinking-free answer.
 */
export function buildSamChatModel(env: object, reasoningEffort: "max" | "low") {
  const baseURL = getEnvValueSync(env, "CHAT_BASE_URL");
  if (baseURL) {
    const modelId = getEnvValueSync(env, "CHAT_MODEL");
    if (!modelId) {
      throw new Error("CHAT_MODEL is required when CHAT_BASE_URL is set");
    }
    const provider = createOpenAICompatible({
      name: "custom",
      baseURL,
      apiKey: getEnvValueSync(env, "CHAT_API_KEY"),
    });
    return wrapLanguageModel({
      model: provider(modelId),
      middleware: extractReasoningMiddleware({
        tagName: "think",
        startWithReasoning:
          getEnvValueSync(env, "CHAT_PREFILLED_THINK") === "true",
      }),
    });
  }

  const apiKey = getEnvValueSync(env, "OPENROUTER_API_KEY");
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is required for the SAM agent");
  }
  return buildChatAgentModel(
    apiKey,
    getEnvValueSync(env, "OPENROUTER_MODEL"),
    reasoningEffort,
  );
}
