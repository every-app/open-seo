import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ waitUntil: vi.fn() }));

const {
  assertPaidPlan,
  mentionsSearch,
  generateText,
  billResearchSpend,
  isHosted,
  creditsDepleted,
  getCached,
  getTracker,
  listResearchKeywords,
} = vi.hoisted(() => ({
  assertPaidPlan: vi.fn(),
  mentionsSearch: vi.fn(),
  generateText: vi.fn(),
  billResearchSpend: vi.fn(),
  isHosted: vi.fn(),
  creditsDepleted: vi.fn(),
  getCached: vi.fn(),
  getTracker: vi.fn(),
  listResearchKeywords: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText,
  Output: { object: (value: unknown) => value },
}));
vi.mock("@/server/lib/openrouter", () => ({
  buildChatAgentModel: vi.fn(),
  requireOpenRouterAccess: async () => ({ apiKey: "key" }),
}));
vi.mock("@/server/lib/chatAgent", () => ({
  requireOpenRouterCostUsd: () => 0.003,
}));
vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: async () => "key",
  getOptionalEnvValue: vi.fn(),
  isHostedServerAuthMode: isHosted,
}));
vi.mock("@/server/billing/researchSpend", () => ({ billResearchSpend }));
vi.mock("@/server/billing/subscription", () => ({
  checkUsageCreditsDepleted: creditsDepleted,
}));
vi.mock("@/server/lib/dataforseo", () => ({
  CHATGPT_LANGUAGE_CODE: "en",
  CHATGPT_LOCATION_CODE: 2840,
  createDataforseoClient: () => ({ aiSearch: { mentionsSearch } }),
}));
vi.mock("@/server/lib/r2-cache", () => ({
  buildCacheKey: async (prefix: string) => prefix,
  getCached,
  setCached: async () => undefined,
}));
vi.mock("./aiVisibilityState", () => ({ getTracker }));
vi.mock("@/server/features/ai-search/services/access", () => ({
  assertPaidAiSearchPlan: assertPaidPlan,
}));
vi.mock("../repositories/AiVisibilityRepository", () => ({
  AiVisibilityRepository: { listResearchKeywords },
}));
vi.mock("@/server/features/projects/repositories/ProjectRepository", () => ({
  ProjectRepository: { getProjectForOrganization: async () => null },
}));
vi.mock(
  "@/server/features/project-context/repositories/ProjectContextRepository",
  () => ({ ProjectContextRepository: { listSections: async () => [] } }),
);

import { listAiResearchKeywords, researchAiPrompts } from "./aiPromptResearch";
import { customer } from "./aiVisibilityTestFixtures";

const input = { projectId: "project", keyword: "seo tool" } as const;

describe("researchAiPrompts", () => {
  beforeEach(() => {
    assertPaidPlan.mockResolvedValue(undefined);
    isHosted.mockResolvedValue(true);
    creditsDepleted.mockResolvedValue({ depleted: false });
    getCached.mockResolvedValue(null);
    getTracker.mockResolvedValue({
      brands: [
        { own: true, name: "OpenSEO", domain: "openseo.so", aliases: [] },
      ],
      prompts: [{ text: "Is Moz a good SEO tool?", archived: false }],
    });
    mentionsSearch.mockResolvedValue([
      {
        question: "what is the most accurate seo tool?",
        answer: "Ahrefs or OpenSEO.",
        ai_search_volume: 40,
        sources: [
          { domain: "www.openseo.so", url: "https://www.openseo.so/a" },
        ],
      },
      {
        question: "What is the most accurate SEO tool in 2026?",
        ai_search_volume: 138,
        sources: [{ domain: "forbes.com", url: "https://forbes.com/b" }],
      },
      { question: "is moz a good seo tool?", ai_search_volume: 71 },
      {
        question: "what does the seo tool and die company make?",
        ai_search_volume: 90,
      },
    ]);
    // Ids follow provider order. The tool-and-die company asks the keyword
    // phrase but means something else, so the model leaves it out.
    generateText.mockImplementation(
      async ({ onStepFinish }: { onStepFinish: (step: object) => unknown }) => {
        await onStepFinish({});
        return { output: { relevant: [0, 1, 2] } };
      },
    );
  });

  it("reads US English ChatGPT prompts, keeps the ones the model finds on topic, merges near-duplicates, and flags the project", async () => {
    const result = await researchAiPrompts(input, customer);

    // ChatGPT data exists only in US English, whatever the tracker market.
    expect(mentionsSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: "chat_gpt",
        locationCode: 2840,
        languageCode: "en",
      }),
    );
    expect(result.prompts).toMatchObject([
      {
        text: "What is the most accurate SEO tool in 2026?",
        variants: ["What is the most accurate seo tool?"],
        ownDomainCited: true,
        brandMentioned: true,
        tracked: false,
      },
      { text: "Is moz a good seo tool?", tracked: true, sources: [] },
    ]);
    expect(billResearchSpend).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "project" }),
      [expect.objectContaining({ provider: "openrouter", costUsd: 0.003 })],
    );
  });

  it("refuses research when hosted credits are used up before buying any data", async () => {
    creditsDepleted.mockResolvedValue({ depleted: true });

    await expect(researchAiPrompts(input, customer)).rejects.toMatchObject({
      code: "INSUFFICIENT_CREDITS",
    });
    expect(mentionsSearch).not.toHaveBeenCalled();
    expect(generateText).not.toHaveBeenCalled();
  });

  it("refuses research without the paid plan before buying any data", async () => {
    assertPaidPlan.mockRejectedValue(new Error("PAYMENT_REQUIRED"));

    await expect(researchAiPrompts(input, customer)).rejects.toThrow(
      "PAYMENT_REQUIRED",
    );
    expect(mentionsSearch).not.toHaveBeenCalled();
    expect(generateText).not.toHaveBeenCalled();
  });

  it("does not buy the same research or relevance check twice within the cache window", async () => {
    getCached.mockImplementation(async (key: string) =>
      key === "ai-visibility:prompt-research"
        ? {
            prompts: [
              {
                question: "which seo tool is free?",
                answer: "",
                volume: 45,
                sources: [],
              },
            ],
          }
        : ["which seo tool is free?"],
    );

    const result = await researchAiPrompts(input, customer);

    expect(mentionsSearch).not.toHaveBeenCalled();
    expect(generateText).not.toHaveBeenCalled();
    expect(result.prompts[0].text).toBe("Which seo tool is free?");
  });
});

describe("listAiResearchKeywords", () => {
  it("lists setup keywords, then tracker topics except General, without a provider call", async () => {
    getTracker.mockResolvedValue({
      topics: ["Backlinks", "General", "SEO tool"],
    });
    listResearchKeywords.mockResolvedValue(["Rank tracker", "seo tool"]);

    const result = await listAiResearchKeywords({ projectId: "project" });

    expect(result.keywords).toEqual(["rank tracker", "seo tool", "backlinks"]);
  });
});
