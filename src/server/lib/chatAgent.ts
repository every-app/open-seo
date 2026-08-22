import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { estimateProviderCost } from "@/server/features/ai/providers";

// OpenRouter (with usage accounting on) reports the real USD cost of each
// response under providerMetadata.openrouter.usage.cost. The cost extraction
// lives in the OpenRouter adapter (estimateProviderCost); this is the
// pre-registry name the onboarding agent still uses.
export function openRouterCostUsd(providerMetadata: unknown): number {
  return estimateProviderCost("openrouter", providerMetadata);
}

// A non-LLM assistant turn streamed back over the chat protocol. Used to surface
// gates ("Subscribe to continue") without spending an LLM call — the client
// renders it as a normal assistant message.
export function staticAssistantResponse(text: string): Response {
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      const id = crypto.randomUUID();
      writer.write({ type: "text-start", id });
      writer.write({ type: "text-delta", id, delta: text });
      writer.write({ type: "text-end", id });
    },
  });
  return createUIMessageStreamResponse({ stream });
}
