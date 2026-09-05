import { describe, expect, it, vi } from "vitest";
import { InvalidToolInputError } from "ai";
import { z } from "zod";
import {
  createStreamErrorNormalizer,
  samStreamErrorGuard,
  withNormalizedStreamErrors,
} from "./samStreamErrorGuard";

// Phase U1/U8: the DO-level stream seam.
//
// Instantiating the real SamChatAgent in vitest is not feasible (Think and
// the server runtime need the workers environment), so this suite pins the
// seam contract with a Think-shaped harness that mirrors exactly how Think
// consumes the result:
//   - Think calls result.toUIMessageStream({ onError: streamErrorToString })
//     at BOTH stream call sites (WebSocket chat + RPC sub-agents).
//   - The error chunk's text is whatever onError returns — the same text that
//     reaches the browser (in-stream error frame), the durable
//     cf:chat:last-terminal record, and reconnect replays.
// The DO's override is a one-line call to samStreamErrorGuard; these tests
// prove that composition normalizes the 2026-09-01 incident payload before
// any of those surfaces can see it.

const RAW_402_MESSAGE =
  "This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.";
const RAW_402_PAYLOAD = JSON.stringify({
  error: {
    message: RAW_402_MESSAGE,
    code: 402,
    metadata: { reason: "in_flight_budget_exhausted" },
    remedy_hint:
      "Adding credits at https://openrouter.ai/settings/credits raises your in-flight budget.",
  },
  user_id: "user_3Ba3GDxUoWnX92HVjC1LMaWRGVR",
});
const CURATED_402 =
  "Your AI provider has insufficient available credits for this request. " +
  "Wait for in-flight requests to settle or add credits, then try again.";

function raw402Error(): Error {
  return Object.assign(new Error(RAW_402_MESSAGE), {
    name: "AI_APICallError",
    statusCode: 402,
    responseHeaders: { "retry-after": "120" },
  });
}

/** Think's raw stringifier — what it hard-codes at every call site. */
function thinkStreamErrorToString(error: unknown): string {
  if (error instanceof Error) return `${error.message} ${RAW_402_PAYLOAD}`;
  return String(error);
}

/** A StreamableResult shaped like the AI SDK's streamText result. */
function fakeThinkResult(
  chunks: unknown[],
  errorToEmit: unknown,
): {
  result: Parameters<typeof samStreamErrorGuard>[1];
  emitted: { type: string; errorText?: string }[];
} {
  const emitted: { type: string; errorText?: string }[] = [];
  const result = {
    toUIMessageStream(options?: {
      onError?: (error: unknown) => string;
    }): AsyncIterable<unknown> {
      return (async function* () {
        for (const chunk of chunks) yield chunk;
        // The AI SDK converts an in-stream failure into an error chunk whose
        // text is onError's return value.
        const errorText = (options?.onError ?? thinkStreamErrorToString)(
          errorToEmit,
        );
        emitted.push({ type: "error", errorText });
        yield { type: "error", errorText };
      })();
    },
  };
  return { result, emitted };
}

describe("samStreamErrorGuard — the SamChatAgent._transformInferenceResult composition", () => {
  it("normalizes the incident's raw 402 before the error chunk is emitted (client + terminal record surface)", async () => {
    const { result, emitted } = fakeThinkResult(
      [{ type: "text-delta", text: "I'll get oriented by reading your site" }],
      raw402Error(),
    );
    const guarded = samStreamErrorGuard(
      { provider: "openrouter", model: "deepseek/deepseek-v4-flash-0731" },
      result,
    );

    // Think's own raw stringifier is passed and must be ignored for the text.
    const out: unknown[] = [];
    for await (const chunk of guarded.toUIMessageStream({
      onError: thinkStreamErrorToString,
    })) {
      out.push(chunk);
    }

    const errorChunk = out.find(
      (c) => (c as { type?: string }).type === "error",
    ) as { errorText?: string };
    expect(errorChunk?.errorText).toBe(CURATED_402);
    // This is the text that would land in cf:chat:last-terminal and the
    // browser error frame — it must carry no vendor payload.
    expect(emitted[0]?.errorText).toBe(CURATED_402);
    expect(emitted[0]?.errorText ?? "").not.toMatch(
      /user_|in_flight_budget_exhausted|https?:\/\//,
    );
    // Non-error chunks flow through untouched.
    expect(out).toContainEqual({
      type: "text-delta",
      text: "I'll get oriented by reading your site",
    });
  });

  it("works when Think calls with no options (default stringifier path)", async () => {
    const { result, emitted } = fakeThinkResult([], raw402Error());
    const guarded = samStreamErrorGuard(
      { provider: "openrouter", model: null },
      result,
    );
    for await (const _ of guarded.toUIMessageStream()) {
      // drain
    }
    expect(emitted[0]?.errorText).toBe(CURATED_402);
  });

  it("still invokes a caller-supplied onError with the ORIGINAL error (logging/telemetry)", async () => {
    const seen: unknown[] = [];
    const { result } = fakeThinkResult([], raw402Error());
    const guarded = samStreamErrorGuard(
      { provider: "openrouter", model: null },
      result,
    );
    for await (const _ of guarded.toUIMessageStream({
      onError: (error) => {
        seen.push(error);
        return "ignored-for-chunk";
      },
    })) {
      // drain
    }
    expect(seen).toHaveLength(1);
    expect((seen[0] as { statusCode?: number }).statusCode).toBe(402);
  });

  it("keeps the result's non-stream surface (output promise) intact", () => {
    const output = Promise.resolve({ value: 42 });
    const guarded = samStreamErrorGuard(
      { provider: "openrouter", model: null },
      {
        toUIMessageStream: () => (async function* () {})(),
        output,
      },
    );
    expect(guarded.output).toBe(output);
    expect(typeof guarded.toUIMessageStream).toBe("function");
  });

  // Phase V at the DO seam: a tool-input rejection (the 2026-09-02 incident
  // shape, with the turn's REAL provider/model bound) must surface as the
  // curated TOOL_INPUT_INVALID message — the incident rendered it as
  // "ollama_cloud does not support a required feature…".
  it("normalizes tool-input rejections at the seam — no provider blame in any emitted surface", async () => {
    const parsed = z
      .object({ keyword: z.string().min(1) })
      .safeParse({ q: "نسبة الاقتباس" });
    const rejection = new InvalidToolInputError({
      toolName: "get_serp_results",
      toolInput: "…",
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- ZodError narrowed through the SDK's error cause contract
      cause: parsed.error as never,
    });
    const { result, emitted } = fakeThinkResult([], rejection);
    const onToolInputError = vi.fn();
    const guarded = samStreamErrorGuard(
      { provider: "ollama_cloud", model: "kimi-k2.7-code" },
      result,
      onToolInputError,
    );
    for await (const _ of guarded.toUIMessageStream()) {
      // drain
    }
    const errorText = emitted[0]?.errorText ?? "";
    expect(errorText).toContain("Invalid tool arguments for get_serp_results");
    expect(errorText).toContain(
      "The request was not executed and no provider call was made.",
    );
    expect(errorText).not.toContain("ollama_cloud");
    expect(errorText).not.toContain("does not support");
    // Observability (V15): one structured rejection event per seam crossing.
    expect(onToolInputError).toHaveBeenCalledTimes(1);
    expect(onToolInputError).toHaveBeenCalledWith({
      tool: "get_serp_results",
      errorClass: "AI_InvalidToolInputError",
    });
  });
});

describe("no auto-retry of PROVIDER_INSUFFICIENT_CREDITS", () => {
  it("the credits code is non-retryable — an automatic retry loop never re-runs the vendor call", async () => {
    const { normalizeProviderError } =
      await import("@/server/features/ai/providerErrors");
    const providerCalls: number[] = [];
    const failingProviderCall = (): never => {
      providerCalls.push(Date.now());
      throw raw402Error();
    };

    // A Think-style bounded retry executor: retry while retryable, max 3.
    const executor = (): { code: string; retryAfterSeconds: number | null } => {
      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          failingProviderCall();
        } catch (error) {
          lastError = error;
          const decision = normalizeProviderError(
            error,
            "openrouter",
            "deepseek/deepseek-v4-flash-0731",
          );
          if (!decision.retryable) {
            return {
              code: decision.code,
              retryAfterSeconds: decision.retryAfterSeconds ?? null,
            };
          }
        }
      }
      return normalizeProviderError(lastError, "openrouter") as {
        code: string;
        retryAfterSeconds: number | null;
      };
    };

    const outcome = executor();
    expect(outcome.code).toBe("PROVIDER_INSUFFICIENT_CREDITS");
    // Exactly ONE provider call: no retry, no infinite loop, and the
    // Retry-After is surfaced for user guidance instead of an auto-retry.
    expect(providerCalls).toHaveLength(1);
    expect(outcome.retryAfterSeconds).toBe(120);
  });
});

describe("createStreamErrorNormalizer — sentinel and failure modes", () => {
  it("preserves Think protocol sentinel strings untouched", () => {
    const normalize = vi.fn();
    const normalizer = createStreamErrorNormalizer({
      provider: "openrouter",
      model: null,
      normalize: () => {
        throw new Error("unreachable");
      },
    });
    void normalize;
    expect(normalizer("chat stream stalled: inactivity watchdog fired")).toBe(
      "chat stream stalled: inactivity watchdog fired",
    );
    expect(normalizer("The assistant was interrupted.")).toBe(
      "The assistant was interrupted.",
    );
  });

  it("degrades to the generic curated message when normalization throws", () => {
    const normalizer = createStreamErrorNormalizer({
      provider: "openrouter",
      model: null,
      normalize: () => {
        throw new Error("classifier exploded");
      },
    });
    expect(normalizer(raw402Error())).toBe(
      "The AI provider could not complete this request.",
    );
  });

  it("withNormalizedStreamErrors preserves the output contract", () => {
    const output = Promise.resolve("x");
    const wrapped = withNormalizedStreamErrors(
      { toUIMessageStream: () => (async function* () {})(), output },
      () => "curated",
    );
    expect(wrapped.output).toBe(output);
  });
});
