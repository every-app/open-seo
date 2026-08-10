import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { ToolExtra } from "@/server/mcp/context";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { MCP_AUTH_CONTEXT_PROP } from "@/server/mcp/context";
import type { fetchKeywordMetricsForList as FetchKeywordMetricsForList } from "@/server/lib/dataforseo/keyword-metrics";

const mocks = vi.hoisted(() => ({
  createDataforseoClient: vi.fn(),
  getProjectForOrganization: vi.fn(),
  seoDataRouter: {
    route: vi.fn(),
  },
}));

vi.mock("cloudflare:workers", () => ({
  env: {},
}));

vi.mock("@/server/lib/r2-cache", () => ({
  buildCacheKey: vi.fn(async (prefix: string) => prefix),
  getCached: vi.fn(async () => null),
  setCached: vi.fn(async () => {}),
  CACHE_TTL: { researchResult: 86400 },
}));

vi.mock("@/server/lib/seo-data", () => ({
  getSeoDataRouter: () => mocks.seoDataRouter,
  isDataforseoBudgetAvailable: vi.fn(async () => true),
}));

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

describe("get_keyword_metrics for Google-Ads-only locations", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createDataforseoClient.mockReset();
    mocks.getProjectForOrganization.mockReset();
    mocks.seoDataRouter.route.mockReset();
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "project_1",
      locationCode: 2840,
      languageCode: "en",
    });
  });

  it("serves Iceland from adsSearchVolume without KD/intent", async () => {
    mocks.seoDataRouter.route.mockResolvedValue({
      dataType: "keyword_metrics",
      provider: "dataforseo",
      fromCache: false,
      durationMs: 100,
      data: [
        {
          keyword: "hotel reykjavik",
          searchVolume: 1300,
          cpc: 2.54,
          competition: 0.42,
          competitionLevel: "HIGH",
          keywordDifficulty: null,
          intent: null,
          monthlySearches: [{ year: 2026, month: 5, searchVolume: 1300 }],
        },
      ],
    });

    const { getKeywordMetricsTool } =
      await import("./dataforseo-research-tools");

    const result = await getKeywordMetricsTool.handler(
      {
        projectId: "project_1",
        keywords: ["hotel reykjavik"],
        locationCode: 2352,
        languageCode: "is",
      },
      toolExtra,
    );

    const rows = z
      .object({ keywords: z.array(z.record(z.string(), z.unknown())) })
      .passthrough()
      .parse(result.structuredContent).keywords;
    expect(rows[0]).toMatchObject({
      keyword: "hotel reykjavik",
      search_volume: 1300,
      keyword_difficulty: null,
      main_intent: null,
      cpc: 2.54,
      competition: 0.42,
      competition_level: "HIGH",
    });
  });

  it("passes the clickstream opt-in to Labs and prefers refined volumes", async () => {
    mocks.seoDataRouter.route.mockResolvedValue({
      dataType: "keyword_metrics",
      provider: "dataforseo",
      fromCache: false,
      durationMs: 100,
      data: [
        {
          keyword: "seo tools",
          searchVolume: 6400,
          cpc: null,
          competition: null,
          competitionLevel: null,
          keywordDifficulty: null,
          intent: null,
          monthlySearches: [{ year: 2026, month: 5, searchVolume: 6400 }],
        },
      ],
    });

    const { getKeywordMetricsTool } =
      await import("./dataforseo-research-tools");

    const result = await getKeywordMetricsTool.handler(
      {
        projectId: "project_1",
        keywords: ["seo tools"],
        includeClickstreamData: true,
      },
      toolExtra,
    );

    // Verify the router was called with the clickstream constraint
    expect(mocks.seoDataRouter.route).toHaveBeenCalledWith({
      dataType: "keyword_metrics",
      keywords: ["seo tools"],
      locationCode: 2840,
      languageCode: "en",
      billingCustomer: {
        organizationId: "org_123",
        userId: "user_123",
        userEmail: "alice@example.com",
        projectId: "project_1",
      },
      constraints: {
        includeClickstreamData: true,
        creditFeature: "keyword_research",
      },
    });
    const rows = z
      .object({ keywords: z.array(z.record(z.string(), z.unknown())) })
      .passthrough()
      .parse(result.structuredContent).keywords;
    expect(rows[0]).toMatchObject({
      keyword: "seo tools",
      search_volume: 6400,
      monthly_searches: [{ year: 2026, month: 5, search_volume: 6400 }],
    });
  });
});
