import { streamText, tool } from "ai";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { buildSamChatModel } from "./samChatModel";

function serveChunks(deltas: object[]) {
  const body = [
    ...deltas.map(
      (delta, index) =>
        `data: ${JSON.stringify({
          id: "c",
          object: "chat.completion.chunk",
          choices: [
            {
              index: 0,
              delta,
              finish_reason: index === deltas.length - 1 ? "stop" : null,
            },
          ],
        })}\n\n`,
    ),
    "data: [DONE]\n\n",
  ].join("");
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(body, { headers: { "content-type": "text/event-stream" } }),
  );
}

async function reply(prefilledThink: boolean) {
  const env = {
    CHAT_BASE_URL: "http://localhost:8000/v1",
    CHAT_MODEL: "local-model",
    CHAT_PREFILLED_THINK: String(prefilledThink),
  };
  const result = streamText({
    model: buildSamChatModel(env, "max"),
    prompt: "What does a canonical tag do?",
    tools: {
      get_keyword_volume: tool({
        inputSchema: z.object({ keyword: z.string() }),
      }),
    },
  });
  return {
    text: await result.text,
    reasoning: await result.reasoningText,
    toolCalls: await result.toolCalls,
  };
}

describe("buildSamChatModel with CHAT_BASE_URL", () => {
  it("moves an inline <think> block out of the reply", async () => {
    serveChunks([
      { role: "assistant", content: "<think>The user wants" },
      { content: " one line.</think>It names the preferred URL." },
    ]);

    const { text, reasoning } = await reply(false);

    expect(text).toBe("It names the preferred URL.");
    expect(reasoning).toBe("The user wants one line.");
  });

  it("treats text before </think> as reasoning when the template pre-fills <think>", async () => {
    serveChunks([
      { role: "assistant", content: "The user wants" },
      { content: " one line.</think>It names the preferred URL." },
    ]);

    const { text, reasoning } = await reply(true);

    expect(text).toBe("It names the preferred URL.");
    expect(reasoning).toBe("The user wants one line.");
  });

  it("accepts tool-call chunks that carry role: null", async () => {
    serveChunks([
      { role: "assistant", content: "" },
      {
        role: null,
        content: null,
        tool_calls: [
          {
            index: 0,
            id: "call_1",
            type: "function",
            function: {
              name: "get_keyword_volume",
              arguments: '{"keyword":"running shoes"}',
            },
          },
        ],
      },
    ]);

    const { toolCalls } = await reply(false);

    expect(toolCalls).toMatchObject([
      { toolName: "get_keyword_volume", input: { keyword: "running shoes" } },
    ]);
  });
});
