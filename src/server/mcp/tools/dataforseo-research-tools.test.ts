import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { ToolExtra } from "@/server/mcp/context";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { MCP_AUTH_CONTEXT_PROP } from "@/server/mcp/context";
import type { fetchKeywordMetricsForList as FetchKeywordMetricsForList } from "@/server/lib/dataforseo/keyword-metrics";

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

const authContext = {
  userId: "user_123",
  userEmail: "alice@example.com",
  organizationId: "org_123",
  clientId: "client_123",
  scopes: ["mcp"],
  audience: "https://open-seo.test/mcp",
  subject: "user_123",
  baseUrl: "https://open-seo.test",
};

const toolExtra: ToolExtra = {
  signal: new AbortController().signal,
  requestId: 1,
  sendNotification: vi.fn(),
  sendRequest: vi.fn(),
  authInfo: {
    token: "token",
    clientId: "client_123",
    scopes: ["mcp"],
    resource: new URL("https://open-seo.test/mcp"),
    extra: { [MCP_AUTH_CONTEXT_PROP]: authContext },
  } satisfies AuthInfo,
};

function textOf(result: {
  content?: Array<{ type: string; text?: string }>;
}): string {
  const first = result.content?.[0];
  return first?.type === "text" ? (first.text ?? "") : "";
}

const usProjectRow = {
  id: "project_1",
  locationCode: 2840,
  languageCode: "en",
};

describe("DataForSEO research MCP tools", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createDataforseoClient.mockReset();
    mocks.getProjectForOrganization.mockReset();
    mocks.getProjectForOrganization.mockResolvedValue(usProjectRow);
  });

  it("searches local businesses without running rankings or Q&A", async () => {
    const businessListings = vi
      .fn()
      .mockResolvedValue([
        { title: "Acme Cafe", url: "https://acme-cafe.example" },
      ]);
    const local = vi.fn();
    const questionsAnswers = vi.fn();

    mocks.createDataforseoClient.mockReturnValue({
      business: { businessListings, questionsAnswers },
      serp: { local },
    });
    const { searchLocalBusinessesTool } =
      await import("./dataforseo-research-tools");

    const result = await searchLocalBusinessesTool.handler(
      {
        projectId: "project_1",
        query: "Acme Cafe",
        near: {
          latitude: 33.123456789,
          longitude: -84.987654321,
          radiusKm: 5,
        },
        categories: ["cafe"],
      },
      toolExtra,
    );

    expect(businessListings).toHaveBeenCalledWith(
      expect.objectContaining({
        locationCoordinate: "33.1234568,-84.9876543,5",
        categories: ["cafe"],
      }),
    );
    expect(local).not.toHaveBeenCalled();
    expect(questionsAnswers).not.toHaveBeenCalled();

    const content = z
      .object({ businesses: z.array(z.object({ title: z.string() })) })
      .passthrough()
      .parse(result.structuredContent);
    expect(content.businesses).toEqual([{ title: "Acme Cafe" }]);
    expect(textOf(result)).toContain("title | category");
    expect(textOf(result)).toContain("Acme Cafe");
  });

  it("fetches one local SERP with search_places disabled", async () => {
    const local = vi.fn().mockResolvedValue([
      {
        type: "maps_search",
        title: "Acme Cafe",
        rank_group: 1,
        rank_absolute: 2,
      },
    ]);

    mocks.createDataforseoClient.mockReturnValue({
      serp: { local },
    });
    const { getLocalSerpResultsTool } =
      await import("./dataforseo-research-tools");

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
      toolExtra,
    );

    expect(local).toHaveBeenCalledWith(
      expect.objectContaining({
        locationCoordinate: "33.1234568,-84.9876543,14z",
        searchPlaces: false,
        searchType: "maps",
        device: "desktop",
      }),
    );

    const content = z
      .object({
        results: z.array(
          z.object({ rank_group: z.number(), rank_absolute: z.number() }),
        ),
      })
      .passthrough()
      .parse(result.structuredContent);
    expect(content.results[0]).toMatchObject({
      rank_group: 1,
      rank_absolute: 2,
    });
    expect(textOf(result)).toContain("rank | title | rating");
    expect(textOf(result)).toContain("Acme Cafe");
  });

  it("fetches Google Business Q&A as an explicit tool", async () => {
    const questionsAnswers = vi
      .fn()
      .mockResolvedValue([{ question_text: "Do you serve breakfast?" }]);

    mocks.createDataforseoClient.mockReturnValue({
      business: { questionsAnswers },
    });
    const { getGoogleBusinessQuestionsTool } =
      await import("./dataforseo-research-tools");

    const result = await getGoogleBusinessQuestionsTool.handler(
      {
        projectId: "project_1",
        keyword: "Acme Cafe",
        near: {
          latitude: 33.123456789,
          longitude: -84.987654321,
          radiusKm: 5,
        },
      },
      toolExtra,
    );

    expect(questionsAnswers).toHaveBeenCalledWith(
      expect.objectContaining({
        keyword: "Acme Cafe",
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
    expect(textOf(result)).toContain("question | asked by");
    expect(textOf(result)).toContain("Do you serve breakfast?");
  });

  it("passes only explicit brand exclusions to ranked keyword filters", async () => {
    const rankedKeywords = vi.fn().mockResolvedValue({
      items: [],
      totalCount: 0,
    });

    mocks.createDataforseoClient.mockReturnValue({
      domain: { rankedKeywords },
    });
    const { getRankedKeywordsTool } =
      await import("./dataforseo-research-tools");

    await getRankedKeywordsTool.handler(
      {
        projectId: "project_1",
        target: "acmeexample.com",
        excludeBrandTerms: ["acme"],
      },
      toolExtra,
    );

    expect(rankedKeywords).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [["keyword_data.keyword", "not_ilike", "%acme%"]],
      }),
    );
  });

  it("filters SERP competitors only by explicit excluded domains", async () => {
    const serpCompetitors = vi.fn().mockResolvedValue([
      { domain: "directory.example", visibility: 10 },
      { domain: "competitor.example", visibility: 5 },
    ]);

    mocks.createDataforseoClient.mockReturnValue({
      labs: { serpCompetitors },
    });
    const { findSerpCompetitorsTool } =
      await import("./dataforseo-research-tools");

    const result = await findSerpCompetitorsTool.handler(
      {
        projectId: "project_1",
        keywords: ["coffee"],
        excludeDomains: ["directory.example"],
      },
      toolExtra,
    );

    const content = z
      .object({ competitors: z.array(z.object({ domain: z.string() })) })
      .passthrough()
      .parse(result.structuredContent);
    expect(content.competitors.map((row) => row.domain)).toEqual([
      "competitor.example",
    ]);
    expect(textOf(result)).toContain("domain | keywords | avg pos");
    expect(textOf(result)).toContain("competitor.example");
  });

  it("keeps AI overview result types out of SERP competitors", async () => {
    const { findSerpCompetitorsTool, getRankedKeywordsTool } =
      await import("./dataforseo-research-tools");

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
    const { getKeywordMetricsTool } =
      await import("./dataforseo-research-tools");

    const result = await getKeywordMetricsTool.handler(
      { projectId: "project_1", keywords: ["seo automation"] },
      toolExtra,
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
    const out = textOf(result);
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
    const { getKeywordMetricsTool } =
      await import("./dataforseo-research-tools");

    const result = await getKeywordMetricsTool.handler(
      {
        projectId: "project_1",
        keywords: ["low", "high", "medium"],
        sortBy: "search_volume",
      },
      toolExtra,
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
    const { getKeywordMetricsTool } =
      await import("./dataforseo-research-tools");

    const result = await getKeywordMetricsTool.handler(
      {
        projectId: "project_1",
        keywords: ["seo"],
        includeMonthlyTrends: false,
      },
      toolExtra,
    );

    const rows = z
      .object({ keywords: z.array(z.record(z.string(), z.unknown())) })
      .passthrough()
      .parse(result.structuredContent).keywords;
    expect(rows[0]).not.toHaveProperty("monthly_searches");
  });
});
