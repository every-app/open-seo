import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { fetchKeywordMetricsForList as FetchKeywordMetricsForList } from "@/server/lib/dataforseo/keyword-metrics";
import * as researchTools from "./dataforseo-research-tools";
import { makeToolContext, textContent } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  createDataforseoClient: vi.fn(),
  getProjectForOrganization: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({
  env: {},
}));

// Keep the real fetchKeywordMetricsForList (it only routes provider calls onto
// the supplied client) so the handler's normalization is exercised end-to-end.
vi.mock("@/server/lib/dataforseo", async () => {
  const keywordMetrics = await vi.importActual<{
    fetchKeywordMetricsForList: typeof FetchKeywordMetricsForList;
  }>("@/server/lib/dataforseo/keyword-metrics");
  return {
    createDataforseoClient: mocks.createDataforseoClient,
    fetchKeywordMetricsForList: keywordMetrics.fetchKeywordMetricsForList,
  };
});

vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));

const toolContext = makeToolContext();

const usProjectRow = {
  id: "project_1",
  locationCode: 2840,
  languageCode: "en",
};

describe("DataForSEO research MCP tools", () => {
  beforeEach(() => {
    mocks.getProjectForOrganization.mockResolvedValue(usProjectRow);
  });

  it("searches local businesses, rounding fractional radii and trimming rows", async () => {
    const businessListings = vi.fn().mockResolvedValue([
      {
        title: "Acme Cafe",
        url: "https://acme-cafe.example",
        // Bulky fields that overflow MCP clients must not reach the response.
        popular_times: { monday: [] },
        attributes: { available_attributes: {} },
      },
    ]);
    const local = vi.fn();
    const questionsAnswers = vi.fn();

    mocks.createDataforseoClient.mockReturnValue({
      business: { businessListings, questionsAnswers },
      serp: { local },
    });

    const result = await researchTools.searchLocalBusinessesTool.handler(
      {
        projectId: "project_1",
        query: "Acme Cafe",
        near: {
          latitude: 33.123456789,
          longitude: -84.987654321,
          radiusKm: 1.5,
        },
        categories: ["cafe"],
      },
      toolContext,
    );

    // Business Listings rejects fractional radii: 1.5 km rounds to 2.
    expect(businessListings).toHaveBeenCalledWith(
      expect.objectContaining({
        locationCoordinate: "33.1234568,-84.9876543,2",
        categories: ["cafe"],
      }),
    );
    expect(local).not.toHaveBeenCalled();
    expect(questionsAnswers).not.toHaveBeenCalled();

    expect(result.structuredContent.businesses).toEqual([
      { title: "Acme Cafe", url: "https://acme-cafe.example" },
    ]);
    expect(textContent(result)).toContain("title | category");
    expect(textContent(result)).toContain("Acme Cafe");
  });

  it("maps local business rating/review/claim filters onto the provider call", async () => {
    const businessListings = vi.fn().mockResolvedValue([]);
    mocks.createDataforseoClient.mockReturnValue({
      business: { businessListings },
    });

    await researchTools.searchLocalBusinessesTool.handler(
      {
        projectId: "project_1",
        near: { latitude: 33, longitude: -84, radiusKm: 5 },
        minRating: 4,
        minReviews: 25,
        isClaimed: false,
        sortBy: "reviews",
        offset: 20,
      },
      toolContext,
    );

    expect(businessListings).toHaveBeenCalledWith(
      expect.objectContaining({
        isClaimed: false,
        filters: [
          ["rating.value", ">=", 4],
          "and",
          ["rating.votes_count", ">=", 25],
        ],
        orderBy: ["rating.votes_count,desc"],
        offset: 20,
      }),
    );
  });

  it("fetches one local SERP with search_places disabled and trims rows", async () => {
    const local = vi.fn().mockResolvedValue([
      {
        title: "Acme Cafe",
        rank_group: 1,
        rank_absolute: 2,
        // Dead-weight provider fields must not reach the response.
        main_image: "https://lh3.example/huge",
        feature_id: "0xabc:0xdef",
      },
    ]);

    mocks.createDataforseoClient.mockReturnValue({
      serp: { local },
    });
    const { getLocalSerpResultsTool } = researchTools;

    const result = await getLocalSerpResultsTool.handler(
      {
        projectId: "project_1",
        keyword: "coffee",
        near: {
          latitude: 33.123456789,
          longitude: -84.987654321,
          zoom: 14,
        },
      },
      toolContext,
    );

    expect(local).toHaveBeenCalledWith(
      expect.objectContaining({
        locationCoordinate: "33.1234568,-84.9876543,14z",
        searchPlaces: false,
        searchType: "maps",
        device: "mobile",
      }),
    );

    const content = z
      .object({ results: z.array(z.object({}).passthrough()) })
      .passthrough()
      .parse(result.structuredContent);
    expect(content.results).toEqual([
      { title: "Acme Cafe", rank_group: 1, rank_absolute: 2 },
    ]);
    expect(textContent(result)).toContain("rank | title | rating");
    expect(textContent(result)).toContain("Acme Cafe");
  });

  it("fetches Google Business Q&A as an explicit tool", async () => {
    const questionsAnswers = vi
      .fn()
      .mockResolvedValue([{ question_text: "Do you serve breakfast?" }]);

    mocks.createDataforseoClient.mockReturnValue({
      business: { questionsAnswers },
    });
    const { getGoogleBusinessQuestionsTool } = researchTools;

    const result = await getGoogleBusinessQuestionsTool.handler(
      {
        projectId: "project_1",
        cid: "123",
        near: {
          latitude: 33.123456789,
          longitude: -84.987654321,
          radiusKm: 5,
        },
      },
      toolContext,
    );

    expect(questionsAnswers).toHaveBeenCalledWith(
      expect.objectContaining({
        // The identifier trio rides the shared cid:/place_id: prefixes.
        keyword: "cid:123",
        locationCoordinate: "33.1234568,-84.9876543,5000",
      }),
    );
    const content = z
      .object({ questions: z.array(z.object({ question_text: z.string() })) })
      .passthrough()
      .parse(result.structuredContent);
    expect(content.questions).toEqual([
      { question_text: "Do you serve breakfast?" },
    ]);
    expect(textContent(result)).toContain("question | asked by");
    expect(textContent(result)).toContain("Do you serve breakfast?");
  });

  it("filters SERP competitors only by explicit excluded domains", async () => {
    const serpCompetitors = vi.fn().mockResolvedValue([
      { domain: "directory.example", visibility: 10 },
      { domain: "competitor.example", visibility: 5 },
    ]);

    mocks.createDataforseoClient.mockReturnValue({
      labs: { serpCompetitors },
    });
    const { findSerpCompetitorsTool } = researchTools;

    const result = await findSerpCompetitorsTool.handler(
      {
        projectId: "project_1",
        keywords: ["coffee"],
        excludeDomains: ["directory.example"],
      },
      toolContext,
    );

    const content = z
      .object({ competitors: z.array(z.object({ domain: z.string() })) })
      .passthrough()
      .parse(result.structuredContent);
    expect(content.competitors.map((row) => row.domain)).toEqual([
      "competitor.example",
    ]);
    expect(textContent(result)).toContain("domain | keywords | avg pos");
    expect(textContent(result)).toContain("competitor.example");
  });

  it("keeps AI overview result types out of SERP competitors", async () => {
    const { findSerpCompetitorsTool, getRankedKeywordsTool } = researchTools;

    expect(
      getRankedKeywordsTool.config.inputSchema.resultTypes.safeParse([
        "ai_overview_reference",
      ]).success,
    ).toBe(true);
    expect(
      findSerpCompetitorsTool.config.inputSchema.resultTypes.safeParse([
        "ai_overview_reference",
      ]).success,
    ).toBe(false);
    expect(
      findSerpCompetitorsTool.config.inputSchema.resultTypes.safeParse([
        "organic",
        "local_pack",
      ]).success,
    ).toBe(true);
  });

  it("normalizes keyword_overview rows with difficulty and intent", async () => {
    const keywordOverview = vi.fn().mockResolvedValue([
      {
        keyword: "seo automation",
        keyword_info: {
          search_volume: 2400,
          cpc: 25.6,
          competition: 0.24,
          competition_level: "LOW",
        },
        keyword_properties: { keyword_difficulty: 18 },
        search_intent_info: { main_intent: "commercial" },
      },
    ]);

    mocks.createDataforseoClient.mockReturnValue({
      labs: { keywordOverview },
    });
    const { getKeywordMetricsTool } = researchTools;

    const result = await getKeywordMetricsTool.handler(
      { projectId: "project_1", keywords: ["seo automation"] },
      toolContext,
    );

    expect(keywordOverview).toHaveBeenCalledWith(
      expect.objectContaining({
        keywords: ["seo automation"],
        locationCode: 2840,
        languageCode: "en",
        creditFeature: "keyword_research",
      }),
    );
    const rows = z
      .object({
        keywords: z.array(
          z
            .object({
              keyword: z.string(),
              search_volume: z.number().nullable(),
              keyword_difficulty: z.number().nullable(),
              main_intent: z.string().nullable(),
            })
            .passthrough(),
        ),
      })
      .passthrough()
      .parse(result.structuredContent).keywords;
    expect(rows[0]).toMatchObject({
      keyword: "seo automation",
      search_volume: 2400,
      keyword_difficulty: 18,
      main_intent: "commercial",
    });
    const out = textContent(result);
    expect(out).toContain("keyword | volume | KD | CPC | competition | intent");
    expect(out).toContain("seo automation");
  });

  it("sorts keyword metric rows by the requested numeric field", async () => {
    const keywordOverview = vi.fn().mockResolvedValue([
      { keyword: "low", keyword_info: { search_volume: 10 } },
      { keyword: "high", keyword_info: { search_volume: 90 } },
      { keyword: "medium", keyword_info: { search_volume: 50 } },
    ]);

    mocks.createDataforseoClient.mockReturnValue({
      labs: { keywordOverview },
    });
    const { getKeywordMetricsTool } = researchTools;

    const result = await getKeywordMetricsTool.handler(
      {
        projectId: "project_1",
        keywords: ["low", "high", "medium"],
        sortBy: "search_volume",
      },
      toolContext,
    );

    const rows = z
      .object({ keywords: z.array(z.object({ keyword: z.string() })) })
      .passthrough()
      .parse(result.structuredContent).keywords;
    expect(rows.map((row) => row.keyword)).toEqual(["high", "medium", "low"]);
  });

  it("drops monthly trends when includeMonthlyTrends is false", async () => {
    const keywordOverview = vi.fn().mockResolvedValue([
      {
        keyword: "seo",
        keyword_info: {
          search_volume: 100,
          monthly_searches: [{ year: 2026, month: 1, search_volume: 100 }],
        },
      },
    ]);

    mocks.createDataforseoClient.mockReturnValue({
      labs: { keywordOverview },
    });
    const { getKeywordMetricsTool } = researchTools;

    const result = await getKeywordMetricsTool.handler(
      {
        projectId: "project_1",
        keywords: ["seo"],
        includeMonthlyTrends: false,
      },
      toolContext,
    );

    const rows = z
      .object({ keywords: z.array(z.record(z.string(), z.unknown())) })
      .passthrough()
      .parse(result.structuredContent).keywords;
    expect(rows[0]).not.toHaveProperty("monthly_searches");
  });
});

describe("get_ranked_keywords scope handling", () => {
  const rankedKeywords =
    vi.fn<
      (input: {
        filters?: unknown[];
      }) => Promise<{ items: unknown[]; totalCount: number }>
    >();

  beforeEach(() => {
    mocks.getProjectForOrganization.mockResolvedValue(usProjectRow);
    rankedKeywords.mockResolvedValue({ items: [], totalCount: 0 });
    mocks.createDataforseoClient.mockReturnValue({
      domain: { rankedKeywords },
    });
  });

  it("passes only explicit brand exclusions to ranked keyword filters", async () => {
    await researchTools.getRankedKeywordsTool.handler(
      {
        projectId: "project_1",
        target: "acmeexample.com",
        scope: "subdomains",
        excludeBrandTerms: ["acme"],
      },
      toolContext,
    );

    expect(rankedKeywords).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [["keyword_data.keyword", "not_ilike", "%acme%"]],
      }),
    );
  });

  it("defaults a bare domain to subdomains scope with no scope filters", async () => {
    const result = await researchTools.getRankedKeywordsTool.handler(
      { projectId: "project_1", target: "acmeexample.com" },
      toolContext,
    );

    expect(rankedKeywords).toHaveBeenCalledWith(
      expect.objectContaining({
        target: "acmeexample.com",
        filters: undefined,
      }),
    );
    expect(result.structuredContent).toMatchObject({
      target: "acmeexample.com",
      scope: "subdomains",
    });
  });

  // The clause shape itself is pinned in researchScopeFilters.test.ts; here
  // only "the scope filter reaches the API call" is the invariant.
  it("sends scope filters for an explicit narrower scope", async () => {
    await researchTools.getRankedKeywordsTool.handler(
      { projectId: "project_1", target: "acmeexample.com", scope: "domain" },
      toolContext,
    );

    expect(Array.isArray(rankedKeywords.mock.calls[0]?.[0].filters)).toBe(true);
  });
});
