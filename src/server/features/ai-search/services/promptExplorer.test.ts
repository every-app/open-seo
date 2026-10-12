import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCached, setCached, buildCacheKey } from "@/server/lib/r2-cache";
import { promptExplorerInputSchema } from "@/types/schemas/ai-search";
import type { LlmResponseResult } from "@/server/lib/dataforseoLlmSchemas";
import { explorePrompt, extractCitations } from "./promptExplorer";

vi.mock("cloudflare:workers", () => ({ waitUntil: vi.fn() }));

const { llmResponse } = vi.hoisted(() => ({ llmResponse: vi.fn() }));
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: () => ({ aiSearch: { llmResponse } }),
}));
vi.mock("@/server/lib/dataforseo/llm-models", () => ({
  resolveLatestLlmModelName: vi.fn(async () => "gpt-5.5"),
}));
vi.mock("@/server/lib/r2-cache", () => ({
  AI_SEARCH_PROMPT_CACHE_NAMESPACE: "ai-search-prompt",
  buildCacheKey: vi.fn(async () => "cache-key"),
  getCached: vi.fn(async () => null),
  setCached: vi.fn(async () => {}),
}));

// DataForSEO's LLM Responses payload nests references as untyped
// `{ title, url }` objects under items[].sections[].annotations — mirroring the
// SDK's AnnotationInfo, which has no citation-type discriminator.
function response(
  annotations: Array<{ title?: string; url?: string }>,
): LlmResponseResult {
  return {
    model_name: "gpt-5",
    web_search: true,
    items: [
      {
        // Annotations outside message items are never citations.
        type: "reasoning",
        sections: [
          {
            type: "summary_text",
            text: "thinking",
            annotations: [{ title: "x", url: "https://x.test/1" }],
          },
        ],
      },
      {
        type: "message",
        sections: [{ type: "text", text: "answer", annotations }],
      },
    ],
  };
}

describe("extractCitations", () => {
  it("keeps untyped annotations (no citation-type discriminator exists)", () => {
    const citations = extractCitations(
      response([
        { title: "Town & Country", url: "https://www.townandcountrymag.com/x" },
        { title: "Stylevana", url: "https://www.stylevana.com/y" },
      ]),
    );
    expect(citations.map((c) => c.url)).toEqual([
      "https://www.townandcountrymag.com/x",
      "https://www.stylevana.com/y",
    ]);
    expect(citations[0]?.domain).toBe("townandcountrymag.com");
    expect(citations[0]?.title).toBe("Town & Country");
  });

  it("dedupes repeated URLs and drops unsafe schemes", () => {
    const citations = extractCitations(
      response([
        { title: "A", url: "https://example.com/a" },
        { title: "A dup", url: "https://example.com/a" },
        { title: "evil", url: "javascript:alert(1)" },
        { title: "no url" },
      ]),
    );
    expect(citations).toHaveLength(1);
    expect(citations[0]?.url).toBe("https://example.com/a");
  });
});

const modelResponse = (webSearch: boolean): LlmResponseResult => ({
  model_name: "gpt-5",
  web_search: webSearch,
  output_tokens: 10,
  items: [
    {
      type: "message",
      sections: [
        {
          type: "text",
          text: "answer",
          annotations: webSearch
            ? [{ title: "Source", url: "https://example.com/post" }]
            : [],
        },
      ],
    },
  ],
});

describe("explorePrompt web-search retry", () => {
  const input = {
    projectId: "p1",
    prompt: "what is the best open source seo tool",
    models: ["chat_gpt" as const],
    webSearch: true,
  };
  const billing = {
    organizationId: "org_1",
    userId: "user_1",
    userEmail: "a@b.c",
  };

  it("retries once when search was requested but the model answered from memory", async () => {
    llmResponse
      .mockResolvedValueOnce(modelResponse(false))
      .mockResolvedValueOnce(modelResponse(true));

    const result = await explorePrompt(input, billing);

    expect(llmResponse).toHaveBeenCalledTimes(2);
    expect(result.results[0]).toMatchObject({
      status: "success",
      webSearch: true,
      citations: [{ url: "https://example.com/post" }],
    });
  });

  it("does not retry when the first response already searched", async () => {
    llmResponse.mockResolvedValueOnce(modelResponse(true));

    await explorePrompt(input, billing);

    expect(llmResponse).toHaveBeenCalledTimes(1);
  });

  it("keeps the first answer when the retry fails", async () => {
    llmResponse
      .mockResolvedValueOnce(modelResponse(false))
      .mockRejectedValueOnce(new Error("upstream timeout"));

    const result = await explorePrompt(input, billing);

    expect(result.results[0]).toMatchObject({
      status: "success",
      webSearch: false,
      text: "answer",
    });
  });
});

describe("Prompt Explorer countries", () => {
  const billing = {
    organizationId: "org_1",
    userId: "user_1",
    userEmail: "a@b.c",
  };
  const input = {
    projectId: "p1",
    prompt: "Кое студио в София бихте препоръчали за PPF защитно фолио?",
    models: ["chat_gpt", "claude", "gemini", "perplexity"] as const,
    webSearch: true,
    webSearchCountryCode: "BG" as const,
  };

  beforeEach(() => {
    llmResponse.mockResolvedValue(modelResponse(true));
    vi.mocked(getCached).mockResolvedValue(null);
    vi.mocked(setCached).mockResolvedValue(undefined);
    vi.mocked(buildCacheKey).mockImplementation(async (_namespace, params) =>
      JSON.stringify(params),
    );
  });

  it("runs supported models and identifies skipped models without spending on them", async () => {
    const result = await explorePrompt(
      promptExplorerInputSchema.parse(input),
      billing,
    );
    expect(result.results).toMatchObject([
      { model: "chat_gpt", status: "success", webSearchCountryCode: "BG" },
      { model: "claude", status: "error", errorCode: "UNSUPPORTED_COUNTRY" },
      { model: "gemini", status: "error", errorCode: "UNSUPPORTED_COUNTRY" },
      { model: "perplexity", status: "success", webSearchCountryCode: "BG" },
    ]);
    expect(llmResponse).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])(
    "runs all models without a hint when webSearch=%s and no country applies",
    async (webSearch) => {
      const result = await explorePrompt(
        promptExplorerInputSchema.parse({
          ...input,
          webSearch,
          webSearchCountryCode: webSearch ? undefined : "BG",
        }),
        billing,
      );
      expect(
        result.results.every(
          (r) => r.status === "success" && r.webSearchCountryCode === null,
        ),
      ).toBe(true);
      expect(llmResponse).toHaveBeenCalledTimes(4);
    },
  );

  it("keeps country-specific cached answers separate and restores their hint", async () => {
    const cache = new Map<string, unknown>();
    vi.mocked(getCached).mockImplementation(
      async (key) => cache.get(key) ?? null,
    );
    vi.mocked(setCached).mockImplementation(async (key, value) => {
      cache.set(key, value);
    });
    const run = (cc: string | undefined) =>
      explorePrompt(
        promptExplorerInputSchema.parse({
          ...input,
          models: ["chat_gpt"],
          webSearchCountryCode: cc,
        }),
        billing,
      );
    await run("US");
    await run("BG");
    await run(undefined);
    const repeated = await run("BG");
    expect(llmResponse).toHaveBeenCalledTimes(3);
    expect(repeated.results[0]).toMatchObject({
      status: "success",
      webSearchCountryCode: "BG",
    });
  });
});
