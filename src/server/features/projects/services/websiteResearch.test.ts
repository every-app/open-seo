import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  generateText,
  readSite,
  search,
  listSections,
  listCompetitors,
  listKeywords,
} = vi.hoisted(() => ({
  generateText: vi.fn(),
  readSite: vi.fn(),
  search: vi.fn(),
  listSections: vi.fn(),
  listCompetitors: vi.fn(),
  listKeywords: vi.fn(),
}));
vi.mock("ai", () => ({
  generateText,
  Output: { object: (value: unknown) => value },
  stepCountIs: vi.fn(),
  tool: (value: unknown) => value,
}));
vi.mock("@/server/lib/scrape", () => ({ readSite }));
vi.mock("@/server/lib/dataforseo/serp", () => ({ fetchLiveSerp: search }));
vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn(),
  getOptionalEnvValue: vi.fn(),
}));
vi.mock("@/server/lib/openrouter", () => ({ buildChatAgentModel: vi.fn() }));
vi.mock("@/server/lib/chatAgent", () => ({
  requireOpenRouterCostUsd: vi.fn(),
}));
vi.mock("@/server/billing/researchSpend", () => ({
  billResearchSpend: vi.fn(),
}));
vi.mock(
  "@/server/features/project-context/repositories/ProjectContextRepository",
  () => ({ ProjectContextRepository: { listSections, listCompetitors } }),
);
vi.mock(
  "@/server/features/ai-visibility/repositories/AiVisibilityRepository",
  () => ({ AiVisibilityRepository: { listResearchKeywords: listKeywords } }),
);

import { researchWebsite } from "./websiteResearch";
import { AppError } from "@/server/lib/errors";
import { customer } from "@/server/features/ai-visibility/services/aiVisibilityTestFixtures";

const project = {
  id: "project",
  name: "Saved brand",
  domain: "saved.com",
  locationCode: 2840,
  languageCode: "en",
};
const topics = [
  "rank tracker",
  "seo tool",
  "backlink checker",
  "keyword research",
  "site audit",
].map((name) => ({
  name,
  prompts: [1, 2, 3, 4, 5].map((n) => `${name} question ${n}?`),
}));
const competitor = {
  name: "Researched rival",
  domain: "rival.com",
  notes: "Competing product",
  sourceUrl: "https://rival.com/",
};
const overview = "Saved overview".padEnd(3800, ".");
type ResearchTools = {
  search_competitors: {
    execute: (input: { queries: string[] }) => Promise<unknown>;
  };
  read_business_sites: {
    execute: (input: { domains: string[] }) => Promise<unknown>;
  };
};

beforeEach(() => {
  listSections.mockResolvedValue([
    { key: "business_overview", content: overview },
  ]);
  listCompetitors.mockResolvedValue([
    { domain: "saved-rival.com", name: "Saved rival", notes: "User notes" },
  ]);
  listKeywords.mockResolvedValue(["saved keyword"]);
  readSite.mockResolvedValue({ pages: [{ url: competitor.sourceUrl }] });
  search.mockResolvedValue({ billing: { costUsd: 0.002 }, data: [] });
  generateText.mockImplementation(
    async ({ tools }: { tools?: ResearchTools }) => {
      if (tools) {
        await tools.search_competitors.execute({
          queries: ["business competitors"],
        });
        await tools.read_business_sites.execute({
          domains: [competitor.domain],
        });
      }
      // Even if the model proposes replacements, only missing fields may survive.
      return {
        output: {
          name: "Researched brand",
          domain: "saved.com",
          overview: "Researched overview",
          competitors: [competitor],
          suggestedTopics: topics,
          suggestedKeywords: ["site audit"],
        },
      };
    },
  );
});

describe("researchWebsite", () => {
  it("does no research when all project fields are already saved", async () => {
    expect(
      await researchWebsite("https://saved.com", project, customer),
    ).toMatchObject({
      name: project.name,
      domain: project.domain,
      overview,
      preserveCompetitors: true,
      suggestedTopics: [],
    });
    expect(generateText).not.toHaveBeenCalled();
    expect(readSite).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
  });

  it.each(["overview", "competitors", "keywords"] as const)(
    "researches only missing %s and preserves the other fields",
    async (field) => {
      if (field === "overview") listSections.mockResolvedValue([]);
      if (field === "competitors") listCompetitors.mockResolvedValue([]);
      if (field === "keywords") listKeywords.mockResolvedValue([]);

      const result = await researchWebsite(
        "https://saved.com",
        project,
        customer,
      );

      expect(result).toEqual({
        name: project.name,
        domain: project.domain,
        overview: field === "overview" ? "Researched overview" : overview,
        preserveCompetitors: field !== "competitors",
        competitors: field === "competitors" ? [competitor] : [],
        suggestedTopics: field === "keywords" ? topics : [],
        suggestedKeywords: field === "keywords" ? ["site audit"] : [],
      });
      if (field === "competitors") expect(search).toHaveBeenCalledOnce();
      else expect(search).not.toHaveBeenCalled();
      if (field === "keywords") expect(readSite).not.toHaveBeenCalled();
    },
  );

  it("drops malformed suggested keywords instead of failing the paid run", async () => {
    listKeywords.mockResolvedValue([]);
    const valid = Array.from({ length: 16 }, (_, n) => `keyword ${n}`);
    generateText.mockResolvedValueOnce({
      output: {
        suggestedTopics: topics,
        suggestedKeywords: ["far too long a keyword for research", ...valid],
      },
    });

    const result = await researchWebsite(
      "https://saved.com",
      project,
      customer,
    );

    expect(result.suggestedKeywords).toEqual(valid.slice(0, 15));
  });

  it.each([
    { failures: 1, competitors: [competitor] },
    { failures: 4, competitors: [] },
  ])(
    "retries search outages and skips competitors when $failures attempts fail",
    async ({ failures, competitors }) => {
      vi.useFakeTimers();
      listCompetitors.mockResolvedValue([]);
      for (let n = 0; n < failures; n++)
        search.mockRejectedValueOnce(new AppError("UPSTREAM_UNAVAILABLE"));

      const research = researchWebsite("https://saved.com", project, customer);
      await vi.runAllTimersAsync();
      const result = await research;
      vi.useRealTimers();

      expect(search).toHaveBeenCalledTimes(Math.min(failures + 1, 4));
      expect(result.competitors).toEqual(competitors);
    },
  );

  it("fails instead of skipping competitors when search fails for a non-outage reason", async () => {
    listCompetitors.mockResolvedValue([]);
    search.mockRejectedValue(new AppError("DATAFORSEO_AUTH_FAILED"));

    await expect(
      researchWebsite("https://saved.com", project, customer),
    ).rejects.toThrow("Website research was incomplete");
    expect(search).toHaveBeenCalledOnce();
  });
});
