import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { ToolExtra } from "@/server/mcp/context";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { MCP_AUTH_CONTEXT_PROP } from "@/server/mcp/context";

const mocks = vi.hoisted(() => ({
  createDataforseoClient: vi.fn(),
  getProjectForOrganization: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({
  env: {},
}));

vi.mock("@/server/lib/dataforseoClient", () => ({
  createDataforseoClient: mocks.createDataforseoClient,
}));

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

describe("DataForSEO research MCP tools", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createDataforseoClient.mockReset();
    mocks.getProjectForOrganization.mockReset();
    mocks.getProjectForOrganization.mockResolvedValue({ id: "project_1" });
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

  it("sorts keyword volume rows by numeric competition index", async () => {
    const searchVolume = vi.fn().mockResolvedValue([
      { keyword: "low", competition: "LOW", competition_index: 10 },
      { keyword: "high", competition: "HIGH", competition_index: 90 },
      { keyword: "medium", competition: "MEDIUM", competition_index: 50 },
    ]);

    mocks.createDataforseoClient.mockReturnValue({
      keywordData: { searchVolume },
    });
    const { getKeywordSearchVolumeTool } =
      await import("./dataforseo-research-tools");

    const result = await getKeywordSearchVolumeTool.handler(
      {
        projectId: "project_1",
        keywords: ["low", "high", "medium"],
        sortBy: "competition",
      },
      toolExtra,
    );

    const rows = z
      .object({ keywords: z.array(z.object({ keyword: z.string() })) })
      .passthrough()
      .parse(result.structuredContent).keywords;
    expect(rows.map((row) => row.keyword)).toEqual(["high", "medium", "low"]);
  });

  it("defaults empty keyword volume market objects to United States", async () => {
    const searchVolume = vi
      .fn()
      .mockResolvedValue([{ keyword: "storage units", search_volume: 1000 }]);

    mocks.createDataforseoClient.mockReturnValue({
      keywordData: { searchVolume },
    });
    const { getKeywordSearchVolumeTool } =
      await import("./dataforseo-research-tools");

    await getKeywordSearchVolumeTool.handler(
      {
        projectId: "project_1",
        keywords: ["storage units"],
        market: {},
      },
      toolExtra,
    );

    expect(searchVolume).toHaveBeenCalledWith(
      expect.objectContaining({
        locationCode: 2840,
      }),
    );
  });

  it("does not accept keyword volume location names", async () => {
    const { getKeywordSearchVolumeTool } =
      await import("./dataforseo-research-tools");

    expect(
      getKeywordSearchVolumeTool.config.inputSchema.market?.safeParse({
        country: "US",
        locationName: "Pittsburgh,PA,United States",
      }).success,
    ).toBe(false);
  });
});
