import type { LanguageModelV3 } from "@openrouter/ai-sdk-provider";
import { subscribe } from "agents/observability";
import { z } from "zod";

// The chat agent's most common failure modes — a provider stream dying
// mid-turn ("chat:request:failed", stage "stream") and a DO restart whose
// recovery gives up ("chat:recovery:exhausted") — never reach an onChatError
// hook; their only signal is the agents:chat diagnostics channel, which is
// silent without a subscriber. This module-level subscription puts them in
// the Workers logs for every chat DO in the isolate. The user-visible residue
// of these is the replayed "Something went wrong" banner plus a
// partially-streamed assistant message.
subscribe("chat", (event) => {
  if (
    event.type === "chat:request:failed" ||
    event.type === "chat:recovery:exhausted"
  ) {
    console.error(
      `[chat] ${event.type}`,
      { agent: event.agent, name: event.name },
      event.payload,
    );
  }
});

// OpenRouter (with usage accounting on) reports the real USD cost of each
// response under providerMetadata.openrouter.usage.cost. Used by SAM to meter
// LLM spend against the credit pool.
const openRouterUsageSchema = z.object({
  openrouter: z.object({ usage: z.object({ cost: z.number() }) }),
});

export function openRouterCostUsd(providerMetadata: unknown): number {
  const parsed = openRouterUsageSchema.safeParse(providerMetadata);
  return parsed.success ? parsed.data.openrouter.usage.cost : 0;
}

export function requireOpenRouterCostUsd(providerMetadata: unknown): number {
  return openRouterUsageSchema.parse(providerMetadata).openrouter.usage.cost;
}

// The provider package re-exports only LanguageModelV3 itself, so the stream
// shape is derived from the interface.
type StreamResult = Awaited<ReturnType<LanguageModelV3["doStream"]>>;

// Nothing is generated, so every counter is zero and there is no provider
// finish reason to report.
const NO_USAGE = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};
const FINISH_STOP = { unified: "stop", raw: undefined } as const;

// A model that ignores its prompt and streams `text` back verbatim. Lets a
// Think agent answer a gated turn through the normal turn pipeline — streamed,
// persisted and rendered like any other assistant message — without ever
// calling a provider: no request, no tokens, and no reasoning channel that
// could leak a chain-of-thought instead of the reply.
export function staticAssistantModel(text: string): LanguageModelV3 {
  return {
    specificationVersion: "v3",
    provider: "openseo",
    modelId: "static-assistant",
    supportedUrls: {},
    doGenerate: async () => ({
      content: [{ type: "text", text }],
      finishReason: FINISH_STOP,
      usage: NO_USAGE,
      warnings: [],
    }),
    doStream: async () => {
      const stream: StreamResult["stream"] = new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "stream-start", warnings: [] });
          controller.enqueue({ type: "text-start", id: "0" });
          controller.enqueue({ type: "text-delta", id: "0", delta: text });
          controller.enqueue({ type: "text-end", id: "0" });
          controller.enqueue({
            type: "finish",
            finishReason: FINISH_STOP,
            usage: NO_USAGE,
          });
          controller.close();
        },
      });
      return { stream };
    },
  };
}
