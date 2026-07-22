import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolExtra } from "@/server/mcp/context";
import { MCP_AUTH_CONTEXT_PROP } from "@/server/mcp/context";

// Verifies that each tool renders its actual row data into the text content
// block (not just a count), across the tools whose data comes from OpenSEO
// services rather than the DataForSEO client. Guards against a column wired to
// the wrong field, which would render a table of only "—".

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  createDataforseoClient: vi.fn(),
  research: vi.fn(),
  profileOverview: vi.fn(),
  profileReferringDomainsPage: vi.fn(),
  profileBacklinksPage: vi.fn(),
  getSuggestedKeywords: vi.fn(),
  getConfigById: vi.fn(),
  getConfigsForProject: vi.fn(),
  getLatestResults: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: mocks.createDataforseoClient,
}));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock("@/server/features/keywords/services/KeywordResearchService", () => ({
  KeywordResearchService: { research: mocks.research },
}));
vi.mock("@/server/features/backlinks/services/BacklinksService", () => ({
  BacklinksService: {
    profileOverview: mocks.profileOverview,
    profileReferringDomainsPage: mocks.profileReferringDomainsPage,
    profileBacklinksPage: mocks.profileBacklinksPage,
  },
}));
vi.mock("@/server/features/domain/services/DomainService", () => ({
  DomainService: { getSuggestedKeywords: mocks.getSuggestedKeywords },
}));
vi.mock(
  "@/server/features/rank-tracking/repositories/RankTrackingRepository",
  () => ({
    RankTrackingRepository: {
      getConfigById: mocks.getConfigById,
      getConfigsForProject: mocks.getConfigsForProject,
    },
  }),
);
vi.mock("@/server/features/rank-tracking/services/rankTrackingResults", () => ({
  getLatestResults: mocks.getLatestResults,
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

function text(result: { content?: Array<{ type: string; text?: string }> }) {
  const first = result.content?.[0];
  return first?.type === "text" ? (first.text ?? "") : "";
}

describe("MCP tool text output (service-backed tools)", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "project_1",
      locationCode: 2840,
      languageCode: "en",
    });
  });

  it("research_keywords renders every keyword row in the text table", async () => {
    mocks.research.mockResolvedValue({
      rows: [
        {
          keyword: "seo tools",
          searchVolume: 2400,
          keywordDifficulty: 18,
          cpc: 3.25,
          competition: 0.4,
          intent: "commercial",
          trend: [],
        },
        {
          keyword: "free seo tools",
          searchVolume: 880,
          keywordDifficulty: null,
          cpc: null,
          competition: null,
          intent: "informational",
          trend: [],
        },
      ],
      source: "related",
      usedFallback: false,
    });
    const { researchKeywordsTool } = await import("./research-keywords");

    const result = await researchKeywordsTool.handler(
      { projectId: "project_1", seeds: [{ seed: "seo tools" }] },
      toolExtra,
    );

    const out = text(result);
    expect(out).toContain("keyword | volume | KD | CPC | competition | intent");
    expect(out).toContain("seo tools | 2400 | 18 | 3.25 | 0.40 | commercial");
    // Second row proves it isn't truncated and nulls render as em dashes.
    expect(out).toContain("free seo tools | 880 | — | — | — | informational");
  });

  it("get_domain_keyword_suggestions renders keyword rows", async () => {
    mocks.getSuggestedKeywords.mockResolvedValue([
      {
        keyword: "seo audit",
        position: 4,
        searchVolume: 880,
        keywordDifficulty: 22,
      },
    ]);
    const { getDomainKeywordSuggestionsTool } =
      await import("./get-domain-keyword-suggestions");

    const result = await getDomainKeywordSuggestionsTool.handler(
      { projectId: "project_1", domain: "example.com" },
      toolExtra,
    );

    const out = text(result);
    expect(out).toContain("keyword | position | volume | KD");
    expect(out).toContain("seo audit | 4 | 880 | 22");
  });

  it("get_backlinks_overview renders all referring-domain rows", async () => {
    mocks.profileOverview.mockResolvedValue({
      overview: {
        summary: {
          backlinks: 1200,
          referringDomains: 340,
          referringPages: 900,
          rank: 55,
        },
      },
    });
    mocks.profileReferringDomainsPage.mockResolvedValue({
      rows: [
        {
          domain: "linker.example",
          backlinks: 42,
          referringPages: 5,
          rank: 30,
        },
      ],
    });
    const { getBacklinksOverviewTool } =
      await import("./get-backlinks-overview");

    const result = await getBacklinksOverviewTool.handler(
      { projectId: "project_1", target: "example.com" },
      toolExtra,
    );

    const out = text(result);
    expect(out).toContain("domain | backlinks | referring pages | rank");
    expect(out).toContain("linker.example | 42 | 5 | 30");
  });

  it("get_backlinks_profile renders all backlink rows", async () => {
    mocks.profileBacklinksPage.mockResolvedValue({
      rows: [
        {
          urlFrom: "https://a.example/post",
          domainFrom: "a.example",
          urlTo: "https://target.example",
          anchor: "click here",
          isDofollow: true,
          rank: 12,
          domainFromRank: 40,
          spamScore: 3,
          isLost: false,
          isBroken: false,
        },
      ],
      page: 1,
      pageSize: 100,
      totalCount: 1,
      hasMore: false,
    });
    const { getBacklinksProfileTool } = await import("./get-backlinks-profile");

    const result = await getBacklinksProfileTool.handler(
      {
        projectId: "project_1",
        target: "example.com",
        page: 1,
        pageSize: 100,
        sortField: "rank",
        sortOrder: "desc",
        filters: {},
        mode: "one_per_domain",
      },
      toolExtra,
    );

    const out = text(result);
    expect(out).toContain(
      "source | target | anchor | type | rank | domainRank | spam | status",
    );
    expect(out).toContain("https://a.example/post");
    expect(out).toContain("click here");
    expect(out).toContain("dofollow");
  });

  it("get_rank_tracker renders every tracked-keyword row (detail view)", async () => {
    mocks.getConfigById.mockResolvedValue({
      id: "tracker_1",
      domain: "example.com",
      scheduleInterval: "daily",
      devices: "desktop",
      serpDepth: 20,
    });
    mocks.getLatestResults.mockResolvedValue({
      run: { lastCheckedAt: "2026-07-01" },
      rows: [
        {
          keyword: "seo tools",
          desktop: { position: 3, previousPosition: 5 },
          mobile: { position: 7, previousPosition: null },
        },
      ],
    });
    const { getRankTrackerTool } = await import("./get-rank-tracker");

    const result = await getRankTrackerTool.handler(
      { projectId: "project_1", trackerId: "tracker_1" },
      toolExtra,
    );

    const out = text(result);
    expect(out).toContain(
      "keyword | desktop | prev (desktop) | mobile | prev (mobile)",
    );
    expect(out).toContain("seo tools | 3 | 5 | 7 | —");
  });

  it("get_ranked_keywords renders nested provider rows as a text table", async () => {
    const rankedKeywords = vi.fn().mockResolvedValue({
      items: [
        {
          keyword_data: {
            keyword: "seo tools",
            keyword_info: { search_volume: 1000, cpc: 3.2 },
          },
          ranked_serp_element: {
            serp_item: { rank_absolute: 4, url: "https://example.com/tools" },
          },
        },
      ],
      totalCount: 1,
    });
    mocks.createDataforseoClient.mockReturnValue({
      domain: { rankedKeywords },
    });
    const { getRankedKeywordsTool } =
      await import("./dataforseo-research-tools");

    const result = await getRankedKeywordsTool.handler(
      { projectId: "project_1", target: "example.com" },
      toolExtra,
    );

    const out = text(result);
    expect(out).toContain("keyword | rank | volume | CPC | url");
    expect(out).toContain(
      "seo tools | 4 | 1000 | 3.20 | https://example.com/tools",
    );
  });

  it("get_serp_results renders each query's items as a text table", async () => {
    const live = vi.fn().mockResolvedValue([
      {
        type: "organic",
        rank_absolute: 1,
        title: "Best SEO Tools",
        url: "https://example.com/best",
        domain: "example.com",
        description: "desc",
      },
    ]);
    mocks.createDataforseoClient.mockReturnValue({ serp: { live } });
    const { getSerpResultsTool } = await import("./get-serp-results");

    const result = await getSerpResultsTool.handler(
      { projectId: "project_1", queries: [{ keyword: "seo tools" }] },
      toolExtra,
    );

    const out = text(result);
    expect(out).toContain("rank | domain | title | url");
    expect(out).toContain(
      "1 | example.com | Best SEO Tools | https://example.com/best",
    );
  });
});
