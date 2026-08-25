import { beforeEach, describe, expect, it, vi } from "vitest";
import * as researchTools from "./dataforseo-research-tools";
import { getBacklinksOverviewTool } from "./get-backlinks-overview";
import { getBacklinksProfileTool } from "./get-backlinks-profile";
import { getDomainKeywordSuggestionsTool } from "./get-domain-keyword-suggestions";
import { getRankTrackerTool } from "./get-rank-tracker";
import { getBusinessUpdatesTool } from "./local-seo-tools";
import { getSerpResultsTool } from "./get-serp-results";
import { researchKeywordsTool } from "./research-keywords";
import { makeToolContext, textContent } from "./tool-test-support";
import type * as backlinksTargetModule from "@/server/lib/dataforseoBacklinksTarget";

// Verifies that each tool renders its actual row data into the text content
// block (not just a count), across the tools whose data comes from OpenSEO
// services rather than the DataForSEO client. Guards against a column wired to
// the wrong field, which would render a table of only "—".

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  createDataforseoClient: vi.fn(),
  fetchBusinessDataTaskResult: vi.fn(),
  research: vi.fn(),
  profileOverview: vi.fn(),
  profileReferringDomainsPage: vi.fn(),
  profileBacklinksPage: vi.fn(),
  getSuggestedKeywords: vi.fn(),
  getConfigById: vi.fn(),
  getConfigsForProject: vi.fn(),
  getLatestResults: vi.fn(),
  getTracker: vi.fn(),
  getConfigs: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/lib/dataforseo", async () => {
  // Real target normalizer (pure, leaf module) so scope resolution in the
  // backlinks tools matches production.
  const targets = await vi.importActual<typeof backlinksTargetModule>(
    "@/server/lib/dataforseoBacklinksTarget",
  );
  return {
    createDataforseoClient: mocks.createDataforseoClient,
    fetchBusinessDataTaskResult: mocks.fetchBusinessDataTaskResult,
    normalizeBacklinksTarget: targets.normalizeBacklinksTarget,
  };
});
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
vi.mock("@/server/features/rank-tracking/services/RankTrackingService", () => ({
  RankTrackingService: {
    getTracker: mocks.getTracker,
    getConfigs: mocks.getConfigs,
  },
}));

const toolContext = makeToolContext();

describe("MCP tool text output (service-backed tools)", () => {
  beforeEach(() => {
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

    const result = await researchKeywordsTool.handler(
      { projectId: "project_1", seeds: [{ seed: "seo tools" }] },
      toolContext,
    );

    const out = textContent(result);
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
    const result = await getDomainKeywordSuggestionsTool.handler(
      { projectId: "project_1", domain: "example.com" },
      toolContext,
    );

    const out = textContent(result);
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
    const result = await getBacklinksOverviewTool.handler(
      { projectId: "project_1", target: "example.com" },
      toolContext,
    );

    const out = textContent(result);
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
      toolContext,
    );

    const out = textContent(result);
    expect(out).toContain(
      "source | target | anchor | type | rank | domainRank | spam | status",
    );
    expect(out).toContain("https://a.example/post");
    expect(out).toContain("click here");
    expect(out).toContain("dofollow");
  });

  it("get_rank_tracker renders every tracked-keyword row (detail view)", async () => {
    mocks.getTracker.mockResolvedValue({
      config: {
        id: "tracker_1",
        domain: "example.com",
        scheduleInterval: "daily",
        devices: "desktop",
        serpDepth: 20,
      },
      results: {
        run: { lastCheckedAt: "2026-07-01" },
        rows: [
          {
            keyword: "seo tools",
            desktop: { position: 3, previousPosition: 5 },
            mobile: { position: 7, previousPosition: null },
          },
        ],
      },
    });

    const result = await getRankTrackerTool.handler(
      { projectId: "project_1", trackerId: "tracker_1" },
      toolContext,
    );

    const out = textContent(result);
    expect(out).toContain(
      "keyword | desktop | prev (desktop) | mobile | prev (mobile)",
    );
    expect(out).toContain("seo tools | 3 | 5 | 7 | —");
  });

  it("get_rank_tracker surfaces the latest run failure", async () => {
    mocks.getTracker.mockResolvedValue({
      config: {
        id: "tracker_1",
        domain: "example.com",
        scheduleInterval: "daily",
        devices: "desktop",
        serpDepth: 20,
      },
      results: {
        run: {
          id: "run_1",
          lastCheckedAt: null,
          status: "failed",
          errorMessage: "Provider request timed out",
        },
        rows: [],
      },
    });

    const result = await getRankTrackerTool.handler(
      { projectId: "project_1", trackerId: "tracker_1" },
      toolContext,
    );

    expect(textContent(result)).toContain(
      "Latest run failed: Provider request timed out",
    );
    expect(result.structuredContent).toMatchObject({
      results: {
        run: {
          status: "failed",
          errorMessage: "Provider request timed out",
        },
      },
    });
    expect(
      getRankTrackerTool.config.outputSchema.safeParse(result.structuredContent)
        .success,
    ).toBe(true);
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
    const { getRankedKeywordsTool } = researchTools;

    const result = await getRankedKeywordsTool.handler(
      { projectId: "project_1", target: "example.com" },
      toolContext,
    );

    const out = textContent(result);
    expect(out).toContain("keyword | rank | volume | CPC | url");
    expect(out).toContain(
      "seo tools | 4 | 1000 | 3.20 | https://example.com/tools",
    );
  });

  it("get_business_updates renders each collected post as a text table", async () => {
    const updatesTaskPost = vi.fn().mockResolvedValue("task-1");
    mocks.createDataforseoClient.mockReturnValue({
      business: { updatesTaskPost },
    });
    mocks.fetchBusinessDataTaskResult.mockResolvedValue({
      status: "completed",
      result: {
        items: [
          {
            rank_absolute: 1,
            post_date: "04/02/2020 00:00:00",
            post_text: "We are open for takeaway.",
            url: "https://search.google.com/local/posts?q=acme",
          },
        ],
      },
    });

    const result = await getBusinessUpdatesTool.handler(
      { projectId: "project_1", cid: "123" },
      toolContext,
    );

    const out = textContent(result);
    expect(out).toContain("# | posted | post | url");
    expect(out).toContain(
      "1 | 04/02/2020 00:00:00 | We are open for takeaway. | https://search.google.com/local/posts?q=acme",
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

    const result = await getSerpResultsTool.handler(
      { projectId: "project_1", queries: [{ keyword: "seo tools" }] },
      toolContext,
    );

    const out = textContent(result);
    expect(out).toContain("rank | domain | title | url");
    expect(out).toContain(
      "1 | example.com | Best SEO Tools | https://example.com/best",
    );
  });
});
