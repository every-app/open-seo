import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as Ai from "ai";
import { z } from "zod";

const {
  generateText,
  readSite,
  search,
  listSections,
  listCompetitors,
  listKeywords,
} = vi.hoisted(() => ({
  generateText:
    vi.fn<
      (options: {
        output: { schema: unknown };
        tools?: ResearchTools;
        abortSignal: AbortSignal;
      }) => Promise<{ output: Record<string, unknown> }>
    >(),
  readSite: vi.fn(),
  search: vi.fn(),
  listSections: vi.fn(),
  listCompetitors: vi.fn(),
  listKeywords: vi.fn(),
}));
vi.mock("ai", async (importOriginal) => ({
  NoObjectGeneratedError: (await importOriginal<typeof Ai>())
    .NoObjectGeneratedError,
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
vi.mock("@/server/lib/openrouter", () => ({
  buildChatAgentModel: vi.fn(),
  requireOpenRouterAccess: vi.fn(async () => ({ apiKey: "test-key" })),
}));
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

import { NoObjectGeneratedError } from "ai";
import { researchWebsite } from "./websiteResearch";
import { billResearchSpend } from "@/server/billing/researchSpend";
import { AppError } from "@/server/lib/errors";
import { customer } from "@/server/features/ai-visibility/services/aiVisibilityTestFixtures";

const project = {
  id: "project",
  name: "Saved project",
  brandName: "Saved brand",
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

const invalidJson = new NoObjectGeneratedError({
  response: { id: "", timestamp: new Date(), modelId: "" },
  usage: {
    inputTokens: 0,
    inputTokenDetails: {
      noCacheTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    outputTokens: 0,
    outputTokenDetails: { textTokens: 0, reasoningTokens: 0 },
    totalTokens: 0,
  },
  finishReason: "stop",
});

describe("researchWebsite", () => {
  it("does no research when all project fields are already saved", async () => {
    expect(
      await researchWebsite("https://saved.com", project, customer),
    ).toMatchObject({
      name: project.brandName,
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
        name: project.brandName,
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

  it("suggests a brand name when none is saved", async () => {
    listKeywords.mockResolvedValue([]);
    const result = await researchWebsite(
      "https://saved.com",
      { ...project, brandName: null },
      customer,
    );
    expect(result.name).toBe("Researched brand");
  });

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

  // Anthropic rejects the word-limit regex, so the model gets none and a long
  // name is cut instead of failing a run that is already billed.
  it("asks the model for no regex and cuts topic names to five words", async () => {
    listSections.mockResolvedValue([]);
    listCompetitors.mockResolvedValue([]);
    listKeywords.mockResolvedValue([]);
    const research = generateText.getMockImplementation();
    if (!research) throw new Error("Expected the default research mock");
    generateText.mockImplementationOnce(async (options) => {
      const { output } = await research(options);
      const longName = "best rank tracker for small agencies";
      return {
        output: {
          ...output,
          suggestedTopics: [
            { ...topics[0], name: longName },
            ...topics.slice(1),
          ],
        },
      };
    });

    const result = await researchWebsite(
      "https://saved.com",
      project,
      customer,
    );

    const schema = generateText.mock.calls[0]?.[0].output.schema;
    if (!(schema instanceof z.ZodType)) throw new Error("Expected a schema");
    expect(JSON.stringify(z.toJSONSchema(schema))).not.toContain('"pattern"');
    expect(result.suggestedTopics[0].name).toBe("best rank tracker for small");
  });

  it("writes prompts for saved topics instead of generating keywords", async () => {
    const names = topics.map((topic) => topic.name);
    listKeywords.mockResolvedValue(names);
    const renamed = topics.map((topic) => ({
      ...topic,
      name: `best ${topic.name}`,
    }));
    generateText.mockResolvedValueOnce({
      output: { suggestedTopics: renamed.slice(0, 3) },
    });

    const result = await researchWebsite(
      "https://saved.com",
      project,
      customer,
      { promptSavedTopics: true },
    );

    const schema = generateText.mock.calls[0]?.[0].output.schema;
    if (!(schema instanceof z.ZodObject)) throw new Error("Expected a schema");
    expect(Object.keys(schema.shape)).toEqual(["suggestedTopics"]);
    // The first three seed tracking, under their saved names.
    expect(result.suggestedTopics.map((topic) => topic.name)).toEqual(
      names.slice(0, 3),
    );
    expect(result.suggestedKeywords).toEqual([]);
  });

  it("drops topics that repeat a name or prompt instead of failing the paid run", async () => {
    listKeywords.mockResolvedValue([]);
    const [first, second, third, fourth] = topics;
    generateText.mockResolvedValueOnce({
      output: {
        suggestedTopics: [
          first,
          { ...second, name: " Rank  Tracker " },
          { ...third, prompts: [...third.prompts.slice(1), first.prompts[0]] },
          {
            ...fourth,
            prompts: [
              ...fourth.prompts.slice(0, 4),
              fourth.prompts[0].toUpperCase(),
            ],
          },
          topics[4],
        ],
        suggestedKeywords: [],
      },
    });

    const result = await researchWebsite(
      "https://saved.com",
      project,
      customer,
    );

    expect(result.suggestedTopics).toEqual([first, topics[4]]);
  });

  it("drops a competitor it could not verify instead of failing the paid run", async () => {
    listCompetitors.mockResolvedValue([]);
    const succeed = generateText.getMockImplementation()!;
    generateText.mockImplementationOnce(async (options) => {
      await succeed(options);
      return {
        output: {
          competitors: [
            competitor,
            { ...competitor, domain: "unread.com" },
            {
              ...competitor,
              domain: "saved.com",
              sourceUrl: "https://saved.com/",
            },
          ],
        },
      };
    });

    const result = await researchWebsite(
      "https://saved.com",
      project,
      customer,
    );

    expect(result.competitors).toEqual([competitor]);
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

  it("retries with fresh tool budgets when the model returns invalid JSON", async () => {
    listCompetitors.mockResolvedValue([]);
    const succeed = generateText.getMockImplementation()!;
    generateText.mockImplementationOnce(async (options) => {
      await succeed(options);
      throw invalidJson;
    });

    const result = await researchWebsite(
      "https://saved.com",
      project,
      customer,
    );

    expect(search).toHaveBeenCalledTimes(2);
    expect(result.competitors).toEqual([competitor]);
  });

  it("explains a research deadline timeout", async () => {
    listCompetitors.mockResolvedValue([]);
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(
      AbortSignal.abort(new DOMException("", "TimeoutError")),
    );
    generateText.mockImplementation(
      ({ abortSignal }: { abortSignal: AbortSignal }) =>
        Promise.reject(abortSignal.reason),
    );

    await expect(
      researchWebsite("https://saved.com", project, customer),
    ).rejects.toThrow("Website research took too long");
    expect(generateText).toHaveBeenCalledOnce();
  });

  it("does not credit a retry with an earlier attempt's search", async () => {
    listCompetitors.mockResolvedValue([]);
    const succeed = generateText.getMockImplementation()!;
    generateText
      .mockImplementationOnce(async (options) => {
        await succeed(options);
        throw invalidJson;
      })
      .mockResolvedValueOnce({ output: { competitors: [] } });

    await expect(
      researchWebsite("https://saved.com", project, customer),
    ).rejects.toThrow("Website research was incomplete");
  });

  it("fails instead of skipping competitors when search fails for a non-outage reason", async () => {
    listCompetitors.mockResolvedValue([]);
    search.mockRejectedValue(new AppError("DATAFORSEO_AUTH_FAILED"));

    await expect(
      researchWebsite("https://saved.com", project, customer),
    ).rejects.toThrow("Website research was incomplete");
    expect(search).toHaveBeenCalledOnce();
  });

  it("bills Context reads of a site that stays unreadable", async () => {
    listSections.mockResolvedValue([]);
    readSite.mockImplementation(
      async (_site, _pages, usage: { contextCredits: number }) => {
        usage.contextCredits += 1;
        return { pages: [] };
      },
    );

    await expect(
      researchWebsite("https://saved.com", project, customer),
    ).rejects.toThrow(AppError);
    expect(billResearchSpend).toHaveBeenCalledWith(customer, [
      expect.objectContaining({ provider: "context", costUsd: 0.0025 }),
    ]);
  });
});
