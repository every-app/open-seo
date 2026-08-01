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

describe("get_keyword_metrics for Google-Ads-only locations", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createDataforseoClient.mockReset();
    mocks.getProjectForOrganization.mockReset();
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "project_1",
      locationCode: 2840,
      languageCode: "en",
    });
  });

  it("serves Iceland from adsSearchVolume without KD/intent", async () => {
    const keywordOverview = vi.fn();
    const adsSearchVolume = vi.fn().mockResolvedValue([
      {
        keyword: "hotel reykjavik",
        search_volume: 1300,
        cpc: 2.54,
        competition: "HIGH",
        competition_index: 42,
        monthly_searches: [{ year: 2026, month: 5, search_volume: 1300 }],
      },
    ]);

    mocks.createDataforseoClient.mockReturnValue({
      labs: { keywordOverview },
      keywords: { adsSearchVolume },
    });
    const { getKeywordMetricsTool } =
      await import("./dataforseo-research-tools");

    const result = await getKeywordMetricsTool.handler(
      {
        projectId: "project_1",
        keywords: ["hotel reykjavik"],
        // Iceland is not supported by DataForSEO Labs.
        locationCode: 2352,
        languageCode: "is",
      },
      toolExtra,
    );

    expect(keywordOverview).not.toHaveBeenCalled();
    expect(adsSearchVolume).toHaveBeenCalledWith(
      expect.objectContaining({
        keywords: ["hotel reykjavik"],
        locationCode: 2352,
        languageCode: "is",
        creditFeature: "keyword_research",
      }),
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
    const keywordOverview = vi.fn().mockResolvedValue([
      {
        keyword: "seo tools",
        keyword_info: {
          search_volume: 10000,
          monthly_searches: [{ year: 2026, month: 5, search_volume: 10000 }],
        },
        keyword_info_normalized_with_clickstream: {
          search_volume: 6400,
          monthly_searches: [{ year: 2026, month: 5, search_volume: 6400 }],
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
        keywords: ["seo tools"],
        includeClickstreamData: true,
      },
      toolExtra,
    );

    expect(keywordOverview).toHaveBeenCalledWith(
      expect.objectContaining({ includeClickstreamData: true }),
    );
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
