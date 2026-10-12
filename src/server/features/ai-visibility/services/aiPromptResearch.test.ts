import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ waitUntil: vi.fn() }));

const {
  assertPaidPlan,
  mentionsSearch,
  serpLive,
  getCached,
  getTracker,
  listResearchKeywords,
} = vi.hoisted(() => ({
  assertPaidPlan: vi.fn(),
  mentionsSearch: vi.fn(),
  serpLive: vi.fn(),
  getCached: vi.fn(),
  getTracker: vi.fn(),
  listResearchKeywords: vi.fn(),
}));

vi.mock("@/server/lib/dataforseo", () => ({
  CHATGPT_LANGUAGE_CODE: "en",
  CHATGPT_LOCATION_CODE: 2840,
  createDataforseoClient: () => ({
    aiSearch: { mentionsSearch },
    serp: { live: serpLive },
  }),
}));
vi.mock("@/server/lib/r2-cache", () => ({
  buildCacheKey: async () => "key",
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

import { listAiResearchKeywords, researchAiPrompts } from "./aiPromptResearch";
import { customer } from "./aiVisibilityTestFixtures";

const input = { projectId: "project", keyword: "seo tool" } as const;

describe("researchAiPrompts", () => {
  beforeEach(() => {
    assertPaidPlan.mockResolvedValue(undefined);
    getCached.mockResolvedValue(null);
    getTracker.mockResolvedValue({
      tracker: { locationCode: 2826, languageCode: "en" },
      topics: [
        { key: "seo", name: "SEO tool", archived: false },
        { key: "old", name: "Old topic", archived: true },
        { key: "general", name: "General", archived: false },
      ],
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
      { question: "is seo tooling worth it?", ai_search_volume: 90 },
      {
        question: "which tool do seo agencies trust?",
        ai_search_volume: 30,
        search_results: [{ domain: "ahrefs.com" }],
      },
      {
        question: "which tool do seo agencies hate?",
        ai_search_volume: 25,
        sources: [{ domain: "www.reddit.com", url: "https://reddit.com/c" }],
      },
    ]);
    serpLive.mockResolvedValue([
      { type: "organic", domain: "www.ahrefs.com" },
      { type: "organic", domain: "www.reddit.com" },
    ]);
  });

  it("reads US English ChatGPT prompts, merges near-duplicates, keeps prompts that ask the keyword or cite on-topic sites, and flags the project", async () => {
    const result = await researchAiPrompts(input, customer);

    // ChatGPT data exists only in US English, whatever the tracker market.
    expect(mentionsSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: "chat_gpt",
        locationCode: 2840,
        languageCode: "en",
      }),
    );
    // Reddit ranks for the keyword too, but citing it says nothing about topic.
    expect(result.prompts).toMatchObject([
      {
        text: "What is the most accurate SEO tool in 2026?",
        variants: ["What is the most accurate seo tool?"],
        ownDomainCited: true,
        brandMentioned: true,
        tracked: false,
      },
      { text: "Is moz a good seo tool?", tracked: true, sources: [] },
      { text: "Which tool do seo agencies trust?" },
    ]);
  });

  it("refuses research without the paid plan before buying any data", async () => {
    assertPaidPlan.mockRejectedValue(new Error("PAYMENT_REQUIRED"));

    await expect(researchAiPrompts(input, customer)).rejects.toThrow(
      "PAYMENT_REQUIRED",
    );
    expect(mentionsSearch).not.toHaveBeenCalled();
    expect(serpLive).not.toHaveBeenCalled();
  });

  it("does not buy the same research twice within the cache window", async () => {
    getCached.mockResolvedValue({
      prompts: [
        {
          question: "which seo tool is free?",
          answer: "",
          volume: 45,
          sources: [],
          domains: [],
        },
      ],
      serpDomains: [],
    });

    const result = await researchAiPrompts(input, customer);

    expect(mentionsSearch).not.toHaveBeenCalled();
    expect(serpLive).not.toHaveBeenCalled();
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
