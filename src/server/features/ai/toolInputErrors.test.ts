import { describe, expect, it } from "vitest";
import { InvalidToolInputError, NoSuchToolError } from "ai";
import { z } from "zod";
import { normalizeProviderError } from "./providerErrors";
import { classifyToolInputError } from "./toolInputErrors";

// The Phase V classification matrix: the 2026-09-02 incident shapes, the
// official SDK error types (V9), their stringified forms, the provider
// capability precision (V3), and the legacy vocabulary regression guard.
// Extracted from providerErrors.test.ts to keep each file within the
// repo's 400-line lint bound.

describe("classifyToolInputError — the extracted classifier", () => {
  it("returns a classification for SDK instances and null for provider errors", () => {
    const parsed = z
      .object({ keyword: z.string().min(1) })
      .safeParse({ q: "نسبة الاقتباس" });
    const rejection = new InvalidToolInputError({
      toolName: "get_serp_results",
      toolInput: "…",
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- ZodError narrowed through the SDK's error cause contract
      cause: parsed.error as never,
    });
    const hit = classifyToolInputError(rejection, [], "");
    expect(hit?.toolName).toBe("get_serp_results");
    expect(hit?.message).toContain(
      "Invalid tool arguments for get_serp_results",
    );

    const miss = classifyToolInputError(
      {
        name: "AI_APICallError",
        message: "Rate limit exceeded",
        statusCode: 429,
      },
      [],
      "Rate limit exceeded",
    );
    expect(miss).toBeNull();
  });

  it("recognizes NoSuchToolError instances", () => {
    const miss = classifyToolInputError(
      new NoSuchToolError({ toolName: "get_serp_resultz", availableTools: [] }),
      [],
      "",
    );
    expect(miss?.toolName).toBe("get_serp_resultz");
    expect(miss?.message).toContain("get_serp_resultz");
  });
});

describe("normalizeProviderError — tool-input failures (Phase V)", () => {
  // The 2026-09-02 incident: three tool requests failed Zod validation
  // BEFORE execute() ran, and every one was mislabeled
  // "ollama_cloud does not support a required feature (such as tool
  // calling)…". They must classify as TOOL_INPUT_INVALID — never as a
  // provider capability failure and never naming the provider.
  const PROVIDER = "ollama_cloud";
  const MODEL = "kimi-k2.7-code";

  /** The model-facing schema of get_serp_results (projectId stripped). */
  const serpSchema = z.object({
    queries: z
      .array(
        z.object({
          keyword: z.string().min(1),
          locationCode: z.number().optional(),
          languageCode: z.string().optional(),
        }),
      )
      .min(1)
      .max(10),
  });

  /** The model-facing schema of list_saved_keywords (projectId stripped). */
  const listSchema = z.object({
    search: z.string().min(1).max(200).optional(),
    tags: z.array(z.string().min(1).max(64)).max(20).optional(),
    limit: z.union([z.literal(50), z.literal(100), z.literal(250)]).optional(),
  });

  function toolInputError(
    toolName: string,
    schema: z.ZodType,
    input: unknown,
  ): InvalidToolInputError {
    const parsed = schema.safeParse(input);
    if (parsed.success) {
      throw new Error("test fixture expected the input to be invalid");
    }
    return new InvalidToolInputError({
      toolName,
      toolInput: JSON.stringify(input),
      cause: parsed.error,
    });
  }

  it("classifies InvalidToolInputError (bare-string queries) as TOOL_INPUT_INVALID, not UNSUPPORTED_FEATURE", () => {
    const error = toolInputError("get_serp_results", serpSchema, {
      queries: ["نسبة الاقتباس"],
    });
    const result = normalizeProviderError(error, PROVIDER, MODEL);
    expect(result.code).toBe("TOOL_INPUT_INVALID");
    expect(result.toolName).toBe("get_serp_results");
    expect(result.retryable).toBe(false);
    // No provider blame (V6): the provider was never called.
    expect(result.provider).toBeUndefined();
    expect(result.message).not.toContain(PROVIDER);
    expect(result.message).not.toContain("does not support");
    // Safe field-level diagnosis survives for self-correction (V4/V5).
    expect(result.message).toContain("get_serp_results");
    expect(result.message).toContain("queries.0");
    expect(result.message).toContain("expected object");
    expect(result.message).toContain(
      "The request was not executed and no provider call was made.",
    );
  });

  it("classifies InvalidToolInputError ({q: …} missing keyword) as TOOL_INPUT_INVALID and names the failing field", () => {
    const error = toolInputError("get_serp_results", serpSchema, {
      queries: [{ q: "نسبة الاقتباس" }],
    });
    const result = normalizeProviderError(error, PROVIDER, MODEL);
    expect(result.code).toBe("TOOL_INPUT_INVALID");
    // The diagnosis must point the model at the required `keyword` field —
    // enough information to self-correct {q: …} → {keyword: …} (V5).
    expect(result.message).toContain("queries.0.keyword");
    expect(result.message).toContain("expected string");
  });

  it("classifies InvalidToolInputError (limit: 200) as TOOL_INPUT_INVALID and shows the allowed values", () => {
    const error = toolInputError("list_saved_keywords", listSchema, {
      limit: 200,
    });
    const result = normalizeProviderError(error, PROVIDER, MODEL);
    expect(result.code).toBe("TOOL_INPUT_INVALID");
    expect(result.toolName).toBe("list_saved_keywords");
    expect(result.message).toContain("limit");
    expect(result.message).toContain("50 | 100 | 250");
    expect(result.message).not.toContain("does not support");
  });

  it("classifies NoSuchToolError as TOOL_INPUT_INVALID", () => {
    const error = new NoSuchToolError({
      toolName: "get_serp_resultz",
      availableTools: ["get_serp_results"],
    });
    const result = normalizeProviderError(error, PROVIDER, MODEL);
    expect(result.code).toBe("TOOL_INPUT_INVALID");
    expect(result.toolName).toBe("get_serp_resultz");
    expect(result.message).toContain("get_serp_resultz");
    expect(result.message).not.toContain(PROVIDER);
  });

  it("classifies the stringified 'Invalid input for tool …' form Think surfaces in-stream", () => {
    const result = normalizeProviderError(
      'Invalid input for tool get_serp_results: [{"expected":"object","code":"invalid_type","path":["queries",0],"message":"Invalid input: expected object, received string"}]',
      PROVIDER,
      MODEL,
    );
    expect(result.code).toBe("TOOL_INPUT_INVALID");
    expect(result.toolName).toBe("get_serp_results");
    expect(result.message).toContain("queries.0");
    expect(result.message).not.toContain("does not support");
  });

  it("classifies the stringified NoSuchToolError message", () => {
    const result = normalizeProviderError(
      "Model tried to call unavailable tool 'get_serp_resultz'. Available tools: a, b.",
      PROVIDER,
    );
    expect(result.code).toBe("TOOL_INPUT_INVALID");
    expect(result.toolName).toBe("get_serp_resultz");
  });

  it("classifies duck-typed error objects (name + message, no class identity)", () => {
    // Duplicated SDK copies across module graphs carry no shared classes;
    // the classifier must recognize the shape (V9 duck-typing).
    const error = {
      name: "AI_InvalidToolInputError",
      message:
        'Invalid input for tool get_serp_results: [{"code":"invalid_type","path":["queries",0,"keyword"],"message":"Invalid input: expected string, received undefined"}]',
      toolName: "get_serp_results",
      toolInput: "…",
    };
    const result = normalizeProviderError(error, PROVIDER);
    expect(result.code).toBe("TOOL_INPUT_INVALID");
    expect(result.toolName).toBe("get_serp_results");
    expect(result.message).toContain("queries.0.keyword");
  });

  it("drops the raw-argument echo from the SDK validator form and keeps only the issue payload", () => {
    // The AI SDK's own validator ("Type validation failed: Value: …") echoes
    // the model's raw arguments — that must not survive into the message.
    const result = normalizeProviderError(
      'Invalid input for tool get_serp_results: Type validation failed: Value: [{"q":"SECRET-ARG"}]. Error message: [{"code":"invalid_type","path":["queries",0,"keyword"],"message":"Invalid input: expected string, received undefined"}]',
      PROVIDER,
    );
    expect(result.code).toBe("TOOL_INPUT_INVALID");
    expect(result.message).toContain("queries.0.keyword");
    expect(result.message).not.toContain("SECRET-ARG");
    expect(result.message).not.toContain("Type validation failed");
  });

  it("bounds the validation detail in the curated message", () => {
    const hugeIssues = Array.from({ length: 40 }, (_, index) => ({
      code: "invalid_type",
      path: ["queries", index, "keyword"],
      message: `Invalid input: expected string, received undefined (issue ${index})`,
    }));
    const error = new InvalidToolInputError({
      toolName: "get_serp_results",
      toolInput: "…",
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test fixture: zod-shaped cause
      cause: { name: "ZodError", issues: hugeIssues } as never,
    });
    const result = normalizeProviderError(error, PROVIDER);
    expect(result.code).toBe("TOOL_INPUT_INVALID");
    // Detail bounded: a subset of issues plus an overflow marker, never the
    // whole 40-issue payload.
    expect(result.message).toMatch(/\(\+\d+ more\)/);
    expect(result.message).not.toContain("(issue 39)");
    expect(result.message.length).toBeLessThan(400);
  });
});

describe("normalizeProviderError — provider capability precision (Phase V)", () => {
  it("classifies genuine tool-calling capability refusals as UNSUPPORTED_FEATURE", () => {
    for (const message of [
      "tool calling is not supported for this model",
      "This model does not support function calling",
      "tools are not supported by this model",
      "'tool calling' functionality not supported.",
      "registry.ollama.ai/library/x does not support tools",
    ]) {
      expect(normalizeProviderError(message, "ollama_cloud").code).toBe(
        "UNSUPPORTED_FEATURE",
      );
    }
  });

  it("no longer classifies tool-adjacent text without refusal wording as a capability failure", () => {
    // The old /tool|function calling/i heuristic matched these; the new
    // matcher requires BOTH a capability term and a refusal term.
    expect(
      normalizeProviderError("Invalid input for tool X", "ollama_cloud").code,
    ).not.toBe("UNSUPPORTED_FEATURE");
    expect(
      normalizeProviderError("Unknown key in tool arguments", "ollama_cloud")
        .code,
    ).not.toBe("UNSUPPORTED_FEATURE");
    expect(
      normalizeProviderError("the tool call was interrupted", "ollama_cloud")
        .code,
    ).not.toBe("UNSUPPORTED_FEATURE");
  });
});

describe("normalizeProviderError — legacy vocabulary stays intact", () => {
  it("still classifies the 402 credits and ZDR policy failures after the reordering", () => {
    expect(
      normalizeProviderError(
        {
          name: "AI_APICallError",
          message:
            "This request would exceed your available credits given your current in-flight requests.",
          statusCode: 402,
        },
        "openrouter",
      ).code,
    ).toBe("PROVIDER_INSUFFICIENT_CREDITS");
    expect(
      normalizeProviderError(
        "No endpoints found matching your data policy (Zero data retention).",
        "openrouter",
      ).code,
    ).toBe("DATA_POLICY_BLOCKED");
  });
});
