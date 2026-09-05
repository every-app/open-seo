import { describe, expect, it, vi } from "vitest";
import { InvalidToolInputError } from "ai";
import { z } from "zod";
import {
  createStreamErrorNormalizer,
  withNormalizedStreamErrors,
} from "./samStreamErrorGuard";
import {
  normalizeProviderError,
  type AIProviderErrorCode,
} from "@/server/features/ai/providerErrors";

// Unit coverage for the normalizer factory. The Think-seam integration
// behavior (raw vendor payload → curated chunk text → client + terminal
// record) lives in samStreamErrorSeam.test.ts.

const RAW_402 =
  "This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.";

const CURATED_402 =
  "Your AI provider has insufficient available credits for this request. " +
  "Wait for in-flight requests to settle or add credits, then try again.";

function rawError(message: string) {
  return Object.assign(new Error(message), {
    name: "AI_APICallError",
    statusCode: 402,
    responseHeaders: { "retry-after": "120" },
  });
}

function apiError(message: string, statusCode: number) {
  return Object.assign(new Error(message), {
    name: "AI_APICallError",
    statusCode,
  });
}

describe("createStreamErrorNormalizer", () => {
  it("normalizes the raw OpenRouter 402 into the curated credits message", () => {
    const normalizer = createStreamErrorNormalizer({
      provider: "openrouter",
      model: "deepseek/deepseek-v4-flash-0731",
    });
    const text = normalizer(rawError(RAW_402));
    expect(text).toBe(CURATED_402);
    expect(text).not.toMatch(
      /user_|cf_ray|in_flight_budget_exhausted|https?:\/\//,
    );
  });

  it("passes through the curated message for every classified code", () => {
    const normalizer = createStreamErrorNormalizer({
      provider: "openrouter",
      model: null,
    });
    const cases: Array<[unknown, string]> = [
      [
        apiError("Rate limit exceeded", 429),
        "openrouter is rate limiting requests. Wait a moment and try again.",
      ],
      [
        new TypeError("fetch failed: ECONNREFUSED 127.0.0.1:11434"),
        "The configured Base URL for openrouter is invalid or unreachable.",
      ],
      [
        apiError(
          "No endpoints found matching your data policy (Zero data retention).",
          404,
        ),
        "openrouter could not find an endpoint compatible with your current Zero Data Retention policy for this model. Choose a compatible model or adjust your OpenRouter privacy settings.",
      ],
    ];
    for (const [error, expected] of cases) {
      expect(normalizer(error)).toBe(expected);
    }
  });

  it("uses the provider/model it was bound with (classification parity with onChatError)", () => {
    const normalize = vi.fn(
      (error: unknown, provider?: string, model?: string) =>
        normalizeProviderError(error, provider, model) as {
          code: AIProviderErrorCode;
          message: string;
        },
    );
    const normalizer = createStreamErrorNormalizer({
      provider: "ollama_cloud",
      model: "kimi-k2.7-code",
      normalize,
    });
    normalizer(apiError("Rate limit exceeded", 429));
    expect(normalize).toHaveBeenCalledWith(
      expect.anything(),
      "ollama_cloud",
      "kimi-k2.7-code",
    );
  });

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
    expect(normalizer(rawError(RAW_402))).toBe(
      "The AI provider could not complete this request.",
    );
  });

  it("withNormalizedStreamErrors preserves the output promise surface", () => {
    const output = Promise.resolve("x");
    const wrapped = withNormalizedStreamErrors(
      { toUIMessageStream: () => (async function* () {})(), output },
      () => "curated",
    );
    expect(wrapped.output).toBe(output);
  });

  // Phase V: tool-input rejections crossing the stream seam.
  function incidentToolInputError(): InvalidToolInputError {
    const parsed = z
      .object({ keyword: z.string().min(1) })
      .safeParse({ q: "نسبة الاقتباس" });
    return new InvalidToolInputError({
      toolName: "get_serp_results",
      toolInput: "…",
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- ZodError narrowed through the SDK's error cause contract
      cause: parsed.error as never,
    });
  }

  it("normalizes a tool-input rejection to the curated TOOL_INPUT_INVALID message — no provider blame", () => {
    const normalizer = createStreamErrorNormalizer({
      provider: "ollama_cloud",
      model: "kimi-k2.7-code",
    });
    const text = normalizer(incidentToolInputError());
    expect(text).toContain("Invalid tool arguments for get_serp_results");
    expect(text).toContain("keyword");
    expect(text).toContain(
      "The request was not executed and no provider call was made.",
    );
    expect(text).not.toContain("ollama_cloud");
    expect(text).not.toContain("does not support");
  });

  it("notifies the onToolInputError observer once per rejection with the safe event fields", () => {
    const onToolInputError = vi.fn();
    const normalizer = createStreamErrorNormalizer({
      provider: "ollama_cloud",
      model: null,
      onToolInputError,
    });
    normalizer(incidentToolInputError());
    expect(onToolInputError).toHaveBeenCalledTimes(1);
    expect(onToolInputError).toHaveBeenCalledWith({
      tool: "get_serp_results",
      errorClass: "AI_InvalidToolInputError",
    });
    // Only tool-input rejections notify — provider failures do not.
    normalizer(apiError("Rate limit exceeded", 429));
    expect(onToolInputError).toHaveBeenCalledTimes(1);
  });

  it("keeps the Phase U invariant: the raw rejection payload never becomes the chunk text", () => {
    const normalizer = createStreamErrorNormalizer({
      provider: "ollama_cloud",
      model: null,
    });
    const text = normalizer(incidentToolInputError());
    // No raw JSON dump of the error object, no echoed arguments.
    expect(text).not.toMatch(/\{"code"/);
    expect(text).not.toContain("نسبة الاقتباس");
  });
});
