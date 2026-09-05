import { describe, expect, it } from "vitest";
import { InvalidToolInputError, stepCountIs, streamText, tool } from "ai";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { z } from "zod";
import {
  createStreamErrorNormalizer,
  withNormalizedStreamErrors,
} from "./samStreamErrorGuard";

// Stream protocol types for the mock model, derived from the mock's own
// doStream signature (ai/test re-exports no part types, and @ai-sdk/provider
// is not a declared direct dependency).
type MockDoStream = InstanceType<typeof MockLanguageModelV3>["doStream"];
type MockStreamResult = Awaited<ReturnType<MockDoStream>>;
type MockStreamPart =
  MockStreamResult["stream"] extends ReadableStream<infer P> ? P : never;

// Phase V regression — the 2026-09-02 powersiment.ae incident, replayed end to
// end through the REAL AI SDK loop:
//
//   attempt 1: queries: ["نسبة الاقتباس"]              (bare strings)
//   attempt 2: queries: [{ q: "نسبة الاقتباس" }]        (unknown key q)
//   attempt 3: queries: [{ keyword: "نسبة الاقتباس" }]  (valid)
//
// The model-facing schema is the exact shape SAM adapts from
// getSerpResultsTool (projectId stripped server-side by adaptMcpTool). The
// assertions pin the three invariants the incident violated:
//   1. attempts 1–2 fail Zod validation BEFORE execute() — no tool, no
//      provider, no DataForSEO call can happen for them;
//   2. the model receives the raw field-level diagnosis back as tool-error
//      feedback, so it can self-correct (it did, on attempt 3);
//   3. the STREAM seam (samStreamErrorGuard) renders those failures as the
//      curated TOOL_INPUT_INVALID message — never "ollama_cloud does not
//      support a required feature…" provider blame.
const querySchema = z.object({
  keyword: z.string().min(1),
  locationCode: z.number().optional(),
  languageCode: z.string().optional(),
});
const serpInputSchema = z.object({
  queries: z.array(querySchema).min(1).max(10),
});

const KEYWORD = "نسبة الاقتباس";
const ATTEMPTS = [
  { queries: [KEYWORD] },
  { queries: [{ q: KEYWORD }] },
  { queries: [{ keyword: KEYWORD }] },
];

/** A mock model that replays the incident's three attempts, then answers. */
function incidentModel(onModelInput: (prompt: unknown) => void) {
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
    doStream: async (options): Promise<MockStreamResult> => {
      step++;
      onModelInput(options.prompt);
      const chunks: MockStreamPart[] = [];
      if (step < ATTEMPTS.length) {
        chunks.push({
          type: "tool-call",
          toolCallId: `call-${step + 1}`,
          toolName: "get_serp_results",
          input: JSON.stringify(ATTEMPTS[step]),
        });
        chunks.push(finish("tool-calls"));
      } else {
        chunks.push({ type: "text-start", id: "t" });
        chunks.push({ type: "text-delta", id: "t", delta: "analysis" });
        chunks.push({ type: "text-end", id: "t" });
        chunks.push(finish("stop"));
      }
      return {
        stream: simulateReadableStream({
          chunks,
          initialDelayInMs: 0,
          chunkDelayInMs: 0,
        }),
      };
    },
  });
}

describe("V10 — get_serp_results incident regression", () => {
  it("only the valid attempt reaches execute(); the model self-corrects across steps", async () => {
    const executions: unknown[] = [];
    const modelInputs: unknown[] = [];

    const result = streamText({
      model: incidentModel((prompt) => modelInputs.push(prompt)),
      prompt: "Analyze powersiment.ae",
      stopWhen: stepCountIs(10),
      tools: {
        get_serp_results: tool({
          description: "SERP lookup",
          inputSchema: serpInputSchema,
          execute: async (args) => {
            executions.push(args);
            return { summary: "ok", data: { results: [] } };
          },
        }),
      },
    });

    const streamEvents: string[] = [];
    for await (const chunk of result.fullStream) {
      streamEvents.push(chunk.type);
      if (chunk.type === "error") {
        throw new Error(`unexpected stream error: ${String(chunk.error)}`);
      }
    }

    // Invariant 1: exactly ONE execution — attempt 3. The invalid requests
    // were rejected by Zod before execute(); no tool/provider/DataForSEO call
    // happened for attempts 1–2.
    expect(executions).toEqual([{ queries: [{ keyword: KEYWORD }] }]);

    // The loop continued after the two rejections (self-correction steps),
    // and the turn finished normally with the final answer.
    expect(streamEvents.filter((type) => type === "tool-error")).toHaveLength(
      2,
    );
    expect(streamEvents).toContain("text-delta");

    // Invariant 2: the raw feedback the model received on the retry steps
    // keeps the field-level diagnosis (queries/keyword), so correction was
    // possible — the unmodified SDK path (V5).
    const feedback = JSON.stringify(modelInputs);
    expect(feedback).toContain("Invalid input for tool get_serp_results");
    expect(feedback).toContain("keyword");
  });

  it("the guarded stream seam renders rejections as TOOL_INPUT_INVALID — no Ollama blame", async () => {
    const normalizer = createStreamErrorNormalizer({
      provider: "ollama_cloud",
      model: "kimi-k2.7-code",
    });
    const rejections: string[] = [];
    const seenErrors: unknown[] = [];

    const result = streamText({
      model: incidentModel(() => {}),
      prompt: "Analyze powersiment.ae",
      stopWhen: stepCountIs(10),
      tools: {
        get_serp_results: tool({
          description: "SERP lookup",
          inputSchema: serpInputSchema,
          execute: async () => ({ summary: "ok" }),
        }),
      },
    });

    // samStreamErrorGuard wraps the Think result at this seam; here the raw
    // streamText result carries the same toUIMessageStream contract. The AI
    // SDK's result satisfies the StreamableResult shape structurally; the
    // guard only spreads and overrides toUIMessageStream.
    const guarded = withNormalizedStreamErrors(
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- streamText's result carries the same toUIMessageStream contract as Think's StreamableResult; the guard overrides only that method
      result as unknown as Parameters<typeof withNormalizedStreamErrors>[0],
      (error) => {
        seenErrors.push(error);
        const message = normalizer(error);
        rejections.push(message);
        return message;
      },
    );

    const errorChunks: string[] = [];
    for await (const chunk of guarded.toUIMessageStream()) {
      if (
        typeof chunk === "object" &&
        chunk !== null &&
        "type" in chunk &&
        chunk.type === "error" &&
        "errorText" in chunk &&
        typeof chunk.errorText === "string"
      ) {
        errorChunks.push(chunk.errorText);
      }
    }

    // Both rejections crossed the seam; the observable error text is curated.
    expect(seenErrors.length + errorChunks.length).toBeGreaterThanOrEqual(2);
    for (const text of [...rejections, ...errorChunks]) {
      // Curated TOOL_INPUT_INVALID shape (V6): names the tool, keeps the
      // safe schema diagnosis, states nothing was executed.
      expect(text).toContain("Invalid tool arguments for get_serp_results");
      expect(text).toContain(
        "The request was not executed and no provider call was made.",
      );
      // NEVER the incident's provider-blame wording.
      expect(text).not.toContain("ollama_cloud");
      expect(text).not.toContain("does not support");
      // No raw provider payload, no stacks, no echo of the model's args.
      expect(text).not.toMatch(/نسبة الاقتباس/);
      expect(text).not.toMatch(/stack|at .+\(.+:\d+:\d+\)/i);
    }
  });

  it("the incident's exact tool parts normalize to TOOL_INPUT_INVALID via normalizeProviderError", async () => {
    const { normalizeProviderError } =
      await import("@/server/features/ai/providerErrors");
    for (const attempt of ATTEMPTS.slice(0, 2)) {
      const parsed = serpInputSchema.safeParse(attempt);
      expect(parsed.success).toBe(false);
      const error = new InvalidToolInputError({
        toolName: "get_serp_results",
        toolInput: JSON.stringify(attempt),
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- ZodError narrowed through the SDK's error cause contract
        cause: parsed.error as never,
      });
      const normalized = normalizeProviderError(error, "ollama_cloud");
      expect(normalized.code).toBe("TOOL_INPUT_INVALID");
      expect(normalized.provider).toBeUndefined();
      expect(normalized.toolName).toBe("get_serp_results");
    }
    // Attempt 3 parses cleanly — this is the call that executes.
    expect(serpInputSchema.safeParse(ATTEMPTS[2]).success).toBe(true);
  });
});

describe("V11 — list_saved_keywords incident regression", () => {
  const listInputSchema = z.object({
    search: z.string().min(1).max(200).optional(),
    tags: z.array(z.string().min(1).max(64)).max(20).optional(),
    limit: z.union([z.literal(50), z.literal(100), z.literal(250)]).optional(),
  });

  it("limit 200 is TOOL_INPUT_INVALID with the allowed values; limit 100 executes", async () => {
    const { normalizeProviderError } =
      await import("@/server/features/ai/providerErrors");
    const invalid = listInputSchema.safeParse({ limit: 200 });
    expect(invalid.success).toBe(false);
    const error = new InvalidToolInputError({
      toolName: "list_saved_keywords",
      toolInput: JSON.stringify({ limit: 200 }),
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- ZodError narrowed through the SDK's error cause contract
      cause: invalid.error as never,
    });
    const normalized = normalizeProviderError(error, "ollama_cloud");
    expect(normalized.code).toBe("TOOL_INPUT_INVALID");
    expect(normalized.message).toContain("50 | 100 | 250");
    expect(normalized.message).not.toContain("ollama_cloud");
    expect(normalized.message).not.toContain("does not support");

    // The corrected call parses — that is the call the SDK lets through.
    expect(listInputSchema.safeParse({ limit: 100 }).success).toBe(true);
  });
});
