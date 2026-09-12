import { describe, expect, it, vi } from "vitest";
import { stepCountIs, streamText, tool } from "ai";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { nullToolExecutionTracker } from "./samToolExecution";
import { createToolRecoveryState } from "./samToolRecovery";
import { executeAdaptedTool } from "./samGuardedToolExecute";

// E2E scenarios for the observed production failure: a paid SAM tool fails
// (402/429/503) and the agent loop must not keep re-executing it. These run
// through the REAL AI SDK loop (streamText + mock model) with the production
// executeAdaptedTool guard + one shared per-turn recovery state — the same
// composition SamChatAgent.beforeTurn builds.

type MockDoStream = InstanceType<typeof MockLanguageModelV3>["doStream"];
type MockStreamResult = Awaited<ReturnType<MockDoStream>>;
type MockStreamPart =
  MockStreamResult["stream"] extends ReadableStream<infer P> ? P : never;

type ScriptStep =
  | { kind: "call"; toolName: string; input: unknown }
  | { kind: "answer"; text: string };

function scriptedModel(
  script: ScriptStep[],
  onStep?: (prompt: unknown) => void,
): MockLanguageModelV3 {
  let step = -1;
  const finish = (unified: "tool-calls" | "stop") =>
    ({
      type: "finish",
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
      finishReason: { unified, raw: unified },
    }) satisfies MockStreamPart;
  return new MockLanguageModelV3({
    doStream: (async (options): Promise<MockStreamResult> => {
      step++;
      onStep?.(options.prompt);
      const current = script[Math.min(step, script.length - 1)];
      const chunks: MockStreamPart[] = [];
      if (current.kind === "call") {
        chunks.push({
          type: "tool-call",
          toolCallId: `call-${step + 1}`,
          toolName: current.toolName,
          input: JSON.stringify(current.input),
        });
        chunks.push(finish("tool-calls"));
      } else {
        chunks.push({ type: "text-start", id: "t" });
        chunks.push({ type: "text-delta", id: "t", delta: current.text });
        chunks.push({ type: "text-end", id: "t" });
        chunks.push(finish("stop"));
      }
      void options;
      return {
        stream: simulateReadableStream({
          chunks,
          initialDelayInMs: 0,
          chunkDelayInMs: 0,
        }),
      };
    }) as MockLanguageModelV3["doStream"],
  });
}

function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode: status });
}

function okResult(structured: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: "summary" }],
    structuredContent: structured,
  };
}

function batchFailed(error: string): CallToolResult {
  return okResult({ results: [{ seed: "s", ok: false as const, error }] });
}

function turnHarness() {
  const recovery = createToolRecoveryState("s", "p");
  const modelInputs: unknown[] = [];
  const guard =
    (
      toolName: string,
      run: () => Promise<CallToolResult>,
    ): ((args: unknown) => Promise<unknown>) =>
    (args: unknown) =>
      executeAdaptedTool({
        toolName,
        fullArgs: args,
        ctx: {
          projectId: "p",
          tracker: nullToolExecutionTracker,
          sessionId: "s",
          recovery,
          sleep: () => Promise.resolve(),
        },
        run,
        cacheable: true,
      });
  return { recovery, modelInputs, guard };
}

function recoveryLogs(events: string[]): Record<string, unknown>[] {
  return events
    .map((line) => {
      try {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- harness parses its own console lines
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter(
      (event): event is Record<string, unknown> =>
        event !== null && event.type === "tool-recovery",
    );
}

describe("scenario A — get_keyword_metrics 402 falls back to GSC, no repeat", () => {
  it("calls the paid tool once, blocks the different-args retry, still answers", async () => {
    const captured: string[] = [];
    const logSpy = vi
      .spyOn(console, "log")
      .mockImplementation((...args: unknown[]) => {
        captured.push(args.map(String).join(" "));
      });
    const { modelInputs, guard } = turnHarness();
    let metricRuns = 0;
    let gscRuns = 0;

    const result = streamText({
      model: scriptedModel(
        [
          {
            kind: "call",
            toolName: "get_keyword_metrics",
            input: { keywords: ["a"] },
          },
          // The observed bug: same tool again with different arguments.
          {
            kind: "call",
            toolName: "get_keyword_metrics",
            input: { keywords: ["b"] },
          },
          {
            kind: "call",
            toolName: "get_search_console_performance",
            input: {},
          },
          { kind: "answer", text: "growth analysis from GSC fallback" },
        ],
        (prompt) => modelInputs.push(prompt),
      ),
      prompt: "Analyze my organic growth opportunities.",
      stopWhen: stepCountIs(10),
      tools: {
        get_keyword_metrics: tool({
          description: "paid metrics",
          inputSchema: z.object({ keywords: z.array(z.string()) }),
          execute: guard("get_keyword_metrics", () => {
            metricRuns++;
            return Promise.reject(
              httpError(402, "payment required, balance is too low"),
            );
          }),
        }),
        get_search_console_performance: tool({
          description: "free gsc",
          inputSchema: z.object({}),
          execute: guard("get_search_console_performance", () => {
            gscRuns++;
            return Promise.resolve(okResult({ rows: [{ query: "q" }] }));
          }),
        }),
      },
    });

    let answer = "";
    for await (const chunk of result.fullStream) {
      if (chunk.type === "text-delta") answer += chunk.text;
      if (chunk.type === "error") throw new Error("unexpected stream error");
    }
    // Reach into the recorded prompts: the blocked signal the model saw on
    // its retry step must carry the unavailable notice + fallback direction.
    expect(metricRuns).toBe(1);
    expect(gscRuns).toBe(1);
    expect(answer).toContain("growth analysis from GSC fallback");
    const seenByModel = JSON.stringify(modelInputs);
    expect(seenByModel).toContain("unavailable for this turn");

    const logs = recoveryLogs(captured);
    expect(
      logs.some(
        (event) =>
          event.tool === "get_keyword_metrics" &&
          event.failureClass === "CREDITS_UNAVAILABLE" &&
          event.retry === false &&
          event.unavailableForTurn === true,
      ),
    ).toBe(true);
    logSpy.mockRestore();
  });
});

describe("scenario B — research_keywords batch 402 uses SERP/GSC fallback", () => {
  it("attempts research once, then completes from fallback data", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { guard } = turnHarness();
    let researchRuns = 0;
    let fallbackRuns = 0;

    const result = streamText({
      model: scriptedModel([
        {
          kind: "call",
          toolName: "research_keywords",
          input: { seeds: ["a"] },
        },
        { kind: "call", toolName: "get_search_console_performance", input: {} },
        { kind: "answer", text: "UAE Arabic opportunities from fallback" },
      ]),
      prompt:
        "Find the best commercial keyword opportunities in the UAE Arabic market.",
      stopWhen: stepCountIs(10),
      tools: {
        research_keywords: tool({
          description: "paid research",
          inputSchema: z.object({ seeds: z.array(z.string()) }),
          execute: guard("research_keywords", () => {
            researchRuns++;
            return Promise.resolve(batchFailed("payment required"));
          }),
        }),
        get_search_console_performance: tool({
          description: "free gsc",
          inputSchema: z.object({}),
          execute: guard("get_search_console_performance", () => {
            fallbackRuns++;
            return Promise.resolve(okResult({ rows: [] }));
          }),
        }),
      },
    });

    let answer = "";
    for await (const chunk of result.fullStream) {
      if (chunk.type === "text-delta") answer += chunk.text;
      if (chunk.type === "error") throw new Error("unexpected stream error");
    }
    expect(researchRuns).toBe(1);
    expect(fallbackRuns).toBe(1);
    expect(answer).toContain("UAE Arabic opportunities from fallback");
    logSpy.mockRestore();
  });
});

describe("scenario C — persistent 429 gets one retry, then fallback", () => {
  it("executes SERP twice total (initial + auto retry), blocks the rest", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { guard } = turnHarness();
    let serpRuns = 0;

    const result = streamText({
      model: scriptedModel([
        { kind: "call", toolName: "get_serp_results", input: { keyword: "x" } },
        { kind: "call", toolName: "get_serp_results", input: { keyword: "x" } },
        { kind: "call", toolName: "get_search_console_performance", input: {} },
        { kind: "answer", text: "answered from fallback data" },
      ]),
      prompt: "Check the SERP.",
      stopWhen: stepCountIs(10),
      tools: {
        get_serp_results: tool({
          description: "paid serp",
          inputSchema: z.object({ keyword: z.string() }),
          execute: guard("get_serp_results", () => {
            serpRuns++;
            return Promise.reject(httpError(429, "too many requests"));
          }),
        }),
        get_search_console_performance: tool({
          description: "free gsc",
          inputSchema: z.object({}),
          execute: guard("get_search_console_performance", () =>
            Promise.resolve(okResult({ rows: [] })),
          ),
        }),
      },
    });

    let answer = "";
    for await (const chunk of result.fullStream) {
      if (chunk.type === "text-delta") answer += chunk.text;
      if (chunk.type === "error") throw new Error("unexpected stream error");
    }
    expect(serpRuns).toBe(2);
    expect(answer).toContain("answered from fallback data");
    logSpy.mockRestore();
  });
});

describe("scenario D — transient 503 then success completes cleanly", () => {
  it("retries once, succeeds, and never marks the tool unavailable", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { guard, recovery } = turnHarness();
    let serpRuns = 0;

    const result = streamText({
      model: scriptedModel([
        { kind: "call", toolName: "get_serp_results", input: { keyword: "x" } },
        { kind: "answer", text: "serp analysis complete" },
      ]),
      prompt: "Check the SERP.",
      stopWhen: stepCountIs(10),
      tools: {
        get_serp_results: tool({
          description: "paid serp",
          inputSchema: z.object({ keyword: z.string() }),
          execute: guard("get_serp_results", () => {
            serpRuns++;
            if (serpRuns === 1) {
              return Promise.reject(httpError(503, "gateway failure"));
            }
            return Promise.resolve(okResult({ items: [{ rank: 1 }] }));
          }),
        }),
      },
    });

    let answer = "";
    for await (const chunk of result.fullStream) {
      if (chunk.type === "text-delta") answer += chunk.text;
      if (chunk.type === "error") throw new Error("unexpected stream error");
    }
    expect(serpRuns).toBe(2);
    expect(answer).toContain("serp analysis complete");
    expect(recovery.getState("get_serp_results")).toBeUndefined();
    logSpy.mockRestore();
  });
});
