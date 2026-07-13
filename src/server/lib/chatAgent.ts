import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { z } from "zod";

// OpenRouter (with usage accounting on) reports the real USD cost of each
// response under providerMetadata.openrouter.usage.cost. Shared by the chat
// agents (onboarding + SAM) that meter LLM spend against the credit pool.
const openRouterUsageSchema = z.object({
  openrouter: z.object({ usage: z.object({ cost: z.number() }) }),
});

export function openRouterCostUsd(providerMetadata: unknown): number {
  const parsed = openRouterUsageSchema.safeParse(providerMetadata);
  return parsed.success ? parsed.data.openrouter.usage.cost : 0;
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
