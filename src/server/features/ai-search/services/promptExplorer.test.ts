import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LlmResponseResult } from "@/server/lib/dataforseoLlmSchemas";

vi.mock("cloudflare:workers", () => ({ waitUntil: vi.fn() }));

const { llmResponseMock, cacheMock, budgetMock, createClientMock } = vi.hoisted(
  () => ({
    llmResponseMock: vi.fn(),
    cacheMock: {
      buildCacheKey: vi.fn(async (_prefix: string, params: unknown) =>
        JSON.stringify(params),
      ),
      getCached: vi.fn(async (_key: string) => null as unknown),
      setCached: vi.fn(
        async (_key: string, _data: unknown, _ttl: number) => undefined,
      ),
    },
    budgetMock: {
      assertDataforseoBudgetAvailable: vi.fn(async () => undefined),
    },
    createClientMock: vi.fn(),
  }),
);

vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: createClientMock,
}));
vi.mock("@/server/lib/r2-cache", () => cacheMock);
vi.mock("@/server/lib/seo-data/cost-tracker", () => budgetMock);
// Real single-flight implementation — the coalescing tests exercise it.
vi.mock("@/server/lib/seo-data/single-flight", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return actual;
});

import { clearSingleFlight } from "@/server/lib/seo-data/single-flight";
import { BudgetExceededError } from "@/server/lib/seo-data/errors";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import type {
  explorePrompt as explorePromptFn,
  extractCitations as extractCitationsFn,
} from "./promptExplorer";
import type { PromptExplorerInput } from "@/types/schemas/ai-search";

let extractCitations: typeof extractCitationsFn;
let explorePrompt: typeof explorePromptFn;

const billingCustomer: BillingCustomerContext = {
  organizationId: "org_1",
  userId: "user_1",
  userEmail: "alice@example.com",
};

function promptInput(
  overrides: Partial<PromptExplorerInput> = {},
): PromptExplorerInput {
  return {
    projectId: "project_1",
    prompt: "What is the best pizza in New York?",
    models: ["chat_gpt"],
    webSearch: false,
    ...overrides,
  };
}

const ANSWER_WITH_NO_CITATIONS: LlmResponseResult = {
  model_name: "gpt-5",
  web_search: false,
  items: [
    {
      type: "message",
      sections: [{ type: "text", text: "Joe's on Prince Street." }],
    },
  ],
};

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
        type: "reasoning",
        sections: [{ type: "summary_text", text: "thinking" }],
      },
      {
        type: "message",
        sections: [{ type: "text", text: "answer", annotations }],
      },
    ],
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(async () => {
  // vi.clearAllMocks clears every mock in this file, including the static
  // llmResponseMock default — the next line restores it before each test.
  vi.clearAllMocks();
  createClientMock.mockReturnValue({ aiSearch: { llmResponse: llmResponseMock } });
  llmResponseMock.mockResolvedValue(ANSWER_WITH_NO_CITATIONS);
  cacheMock.getCached.mockResolvedValue(null);
  budgetMock.assertDataforseoBudgetAvailable.mockResolvedValue(undefined);
  clearSingleFlight();
  ({ extractCitations, explorePrompt } = await import("./promptExplorer"));
});

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

  it("ignores annotations outside message items and returns [] when absent", () => {
    expect(extractCitations({ items: [] })).toEqual([]);
    expect(
      extractCitations({
        items: [
          {
            type: "reasoning",
            sections: [
              {
                type: "summary_text",
                text: "t",
                annotations: [{ title: "x", url: "https://x.test/1" }],
              },
            ],
          },
        ],
      }),
    ).toEqual([]);
  });
});

describe("explorePrompt cost containment", () => {
  it("caches a successful model response and serves repeats without a paid model call", async () => {
    const first = await explorePrompt(promptInput(), billingCustomer);
    expect(first.results).toHaveLength(1);
    expect(first.results[0]?.status).toBe("success");
    expect(cacheMock.setCached).toHaveBeenCalledTimes(1);

    // Simulate the R2 entry landing for the second request.
    const stored = cacheMock.setCached.mock.calls[0]?.[1];
    cacheMock.getCached.mockResolvedValueOnce(stored);

    const second = await explorePrompt(promptInput(), billingCustomer);
    expect(second.results[0]?.status).toBe("success");
    expect(llmResponseMock).toHaveBeenCalledTimes(1);
    expect(cacheMock.setCached).toHaveBeenCalledTimes(1);
  });

  it("coalesces identical concurrent prompts into one model execution", async () => {
    const [a, b] = await Promise.all([
      explorePrompt(promptInput(), billingCustomer),
      explorePrompt(promptInput(), billingCustomer),
    ]);

    expect(llmResponseMock).toHaveBeenCalledTimes(1);
    expect(cacheMock.setCached).toHaveBeenCalledTimes(1);
    expect(a.results[0]?.status).toBe("success");
    expect(b.results[0]?.status).toBe("success");
  });

  it("does not coalesce prompts across projects", async () => {
    await Promise.all([
      explorePrompt(promptInput({ projectId: "project_1" }), billingCustomer),
      explorePrompt(promptInput({ projectId: "project_2" }), billingCustomer),
    ]);

    expect(llmResponseMock).toHaveBeenCalledTimes(2);
  });

  it("does not coalesce prompts across models", async () => {
    await explorePrompt(
      promptInput({ models: ["chat_gpt", "claude"] }),
      billingCustomer,
    );
    await flushMicrotasks();

    expect(llmResponseMock).toHaveBeenCalledTimes(2);
    const slugs = llmResponseMock.mock.calls.map((call) =>
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test asserts the mocked call args shape
      (call[0] as { modelSlug: string }).modelSlug,
    );
    expect(slugs.toSorted()).toEqual(["chat_gpt", "claude"]);
  });

  it("keeps per-model deduplication for an explicit duplicate model list", async () => {
    await explorePrompt(
      promptInput({ models: ["chat_gpt", "chat_gpt"] }),
      billingCustomer,
    );

    expect(llmResponseMock).toHaveBeenCalledTimes(1);
    expect(cacheMock.setCached).toHaveBeenCalledTimes(1);
  });

  it("isolates a per-model failure without discarding the paid sibling", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    llmResponseMock.mockImplementation(
      async ({ modelSlug }: { modelSlug: string }) => {
        if (modelSlug === "claude") throw new Error("claude down");
        return ANSWER_WITH_NO_CITATIONS;
      },
    );

    const result = await explorePrompt(
      promptInput({ models: ["chat_gpt", "claude"] }),
      billingCustomer,
    );

    const byModel = Object.fromEntries(
      result.results.map((r) => [r.model, r.status]),
    );
    expect(byModel.chat_gpt).toBe("success");
    expect(byModel.claude).toBe("error");
    expect(cacheMock.setCached).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  it("fails the paid exploration before any DataForSEO call when the budget is exhausted", async () => {
    budgetMock.assertDataforseoBudgetAvailable.mockRejectedValue(
      new BudgetExceededError("daily", 1, 1),
    );

    await expect(
      explorePrompt(promptInput(), billingCustomer),
    ).rejects.toThrow("daily budget exceeded");
    expect(llmResponseMock).not.toHaveBeenCalled();
    expect(cacheMock.setCached).not.toHaveBeenCalled();
  });

  it("excludes highlightBrand from the cache key so one paid answer serves every highlight", async () => {
    await explorePrompt(
      promptInput({ highlightBrand: "joe's" }),
      billingCustomer,
    );
    await explorePrompt(promptInput({ highlightBrand: "rubirosa" }), billingCustomer);

    const [prefixA, paramsA] = cacheMock.buildCacheKey.mock.calls[0];
    const [prefixB, paramsB] = cacheMock.buildCacheKey.mock.calls[1];
    expect(prefixA).toBe("ai-search:prompt-response");
    expect(prefixB).toBe("ai-search:prompt-response");
    expect(paramsA).toEqual(paramsB);
    expect(JSON.stringify(paramsA)).not.toContain("highlight");
  });
});
