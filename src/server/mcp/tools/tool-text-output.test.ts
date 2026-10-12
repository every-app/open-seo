/* eslint-disable max-lines, max-lines-per-function -- one spec covers every service-backed MCP text table */
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as researchTools from "./dataforseo-research-tools";
import { getBacklinksOverviewTool } from "./get-backlinks-overview";
import { getDomainKeywordSuggestionsTool } from "./get-domain-keyword-suggestions";
import {
  getGoogleAnalyticsOrganicLandingPagesTool,
  getGoogleAnalyticsOrganicOverviewTool,
  getGoogleAnalyticsPagePerformanceTool,
  getGoogleAnalyticsTrafficAcquisitionTool,
} from "./google-analytics-tools";
import { getRankTrackerTool } from "./get-rank-tracker";
import { getBusinessUpdatesTool } from "./local-seo-tools";
import { makeToolContext, textContent } from "./tool-test-support";
import { makeGa4ReportResult } from "@/server/features/ga4/services/ga4-test-fixtures";
import type * as backlinksTargetModule from "@/server/lib/dataforseoBacklinksTarget";

// Verifies that each tool renders its actual row data into the text content
// block (not just a count), across the tools whose data comes from OpenSEO
// services rather than the DataForSEO client. Guards against a column wired to
// the wrong field, which would render a table of only "—".

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  createDataforseoClient: vi.fn(),
  fetchBusinessDataTaskResult: vi.fn(),
  profileOverview: vi.fn(),
  profileReferringDomainsPage: vi.fn(),
  getSuggestedKeywords: vi.fn(),
  getTracker: vi.fn(),
  getConfigs: vi.fn(),
  runGa4Report: vi.fn(),
  getOrganicOverview: vi.fn(),
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
vi.mock("@/server/features/backlinks/services/BacklinksService", () => ({
  BacklinksService: {
    profileOverview: mocks.profileOverview,
    profileReferringDomainsPage: mocks.profileReferringDomainsPage,
  },
}));
vi.mock("@/server/features/domain/services/DomainService", () => ({
  DomainService: { getSuggestedKeywords: mocks.getSuggestedKeywords },
}));
vi.mock("@/server/features/rank-tracking/services/RankTrackingService", () => ({
  RankTrackingService: {
    getTracker: mocks.getTracker,
    getConfigs: mocks.getConfigs,
  },
}));
vi.mock("@/server/features/ga4/services/Ga4ReportingService", () => ({
  Ga4ReportingService: { runReport: mocks.runGa4Report },
}));
vi.mock("@/server/features/ga4/services/Ga4OrganicOverviewService", () => ({
  Ga4OrganicOverviewService: {
    getOrganicOverview: mocks.getOrganicOverview,
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
          completedAt: null,
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
      "Latest run: failed — Provider request timed out",
    );
    expect(result.structuredContent).toMatchObject({
      results: {
        run: {
          status: "failed",
          errorMessage: "Provider request timed out",
        },
      },
    });
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

  it("get_google_analytics_organic_landing_pages renders every fetched row and points at offset paging", async () => {
    const rows = Array.from({ length: 16 }, (_, index) => ({
      hostName: "example.com",
      landingPage: `/p/${index + 1}`,
      sessions: 16 - index,
    }));
    mocks.runGa4Report.mockResolvedValue(
      makeGa4ReportResult({
        rowCount: 16,
        totalRowCount: 40,
        rows,
        pageInfo: { offset: 0, limit: 16, hasMore: true, nextOffset: 16 },
        request: {
          dimensions: ["hostName", "landingPage"],
          metrics: ["sessions"],
        },
      }),
    );

    const result = await getGoogleAnalyticsOrganicLandingPagesTool.handler(
      { projectId: "project_1", limit: 16, offset: 0 },
      toolContext,
    );

    expect(textContent(result)).toEqual(
      [
        "Organic landing pages: 16 of 40 rows for 2026-07-09 through 2026-08-05. More rows are available; call again with offset to page through them.",
        "hostName | landingPage | sessions",
        ...rows.map(
          (row) => `${row.hostName} | ${row.landingPage} | ${row.sessions}`,
        ),
      ].join("\n"),
    );
    expect(result.structuredContent).toMatchObject({ rows });
  });

  // Empty-result copy: an agent must learn that the report was filtered to
  // Organic Search (and that its endDate moved) rather than conclude the site
  // has no traffic.
  it.each([
    [
      "page_performance names the Organic Search filter when empty",
      () =>
        getGoogleAnalyticsPagePerformanceTool.handler(
          {
            projectId: "project_1",
            includeDate: false,
            channel: "organic_search",
            limit: 100,
            offset: 0,
          },
          toolContext,
        ),
      makeGa4ReportResult({
        request: {
          reportKind: "page_performance",
          channel: "organic_search",
          dimensions: ["hostName", "pagePath"],
          metrics: ["screenPageViews"],
        },
      }),
      "Page performance: 0 of 0 rows for 2026-07-09 through 2026-08-05. This report is filtered to Organic Search. Pass channel=all to include every channel.",
    ],
    [
      "organic_landing_pages names Organic Search without a channel argument",
      () =>
        getGoogleAnalyticsOrganicLandingPagesTool.handler(
          { projectId: "project_1", limit: 100, offset: 0 },
          toolContext,
        ),
      makeGa4ReportResult(),
      "Organic landing pages: 0 of 0 rows for 2026-07-09 through 2026-08-05. This report is limited to Organic Search.",
    ],
    [
      "organic_landing_pages states an end-date clamp",
      () =>
        getGoogleAnalyticsOrganicLandingPagesTool.handler(
          { projectId: "project_1", limit: 100, offset: 0 },
          toolContext,
        ),
      makeGa4ReportResult({ warnings: ["end_date_clamped"] }),
      "Organic landing pages: 0 of 0 rows for 2026-07-09 through 2026-08-05. The requested endDate was moved back to 2026-08-05, the last complete Analytics day. This report is limited to Organic Search.",
    ],
    [
      "traffic_acquisition does not mention Organic Search when empty",
      () =>
        getGoogleAnalyticsTrafficAcquisitionTool.handler(
          {
            projectId: "project_1",
            breakdown: "channel_group",
            comparePreviousPeriod: false,
            limit: 100,
            offset: 0,
          },
          toolContext,
        ),
      makeGa4ReportResult({
        request: {
          reportKind: "traffic_acquisition",
          channel: "all",
          dimensions: ["sessionDefaultChannelGroup"],
          metrics: ["sessions"],
        },
      }),
      "Traffic acquisition: 0 of 0 rows for 2026-07-09 through 2026-08-05.",
    ],
  ])("get_google_analytics_%s", async (_label, call, report, expected) => {
    mocks.runGa4Report.mockResolvedValue(report);

    expect(textContent(await call())).toEqual(expected);
  });

  it("get_google_analytics_organic_overview states a truncated trend and names Organic Search when there is no current row", async () => {
    mocks.getOrganicOverview.mockResolvedValue({
      status: "ok",
      request: {
        resolvedDateRange: { startDate: "2026-07-09", endDate: "2026-08-05" },
        previousDateRange: { startDate: "2026-06-11", endDate: "2026-07-08" },
      },
      warnings: ["trend_truncated"],
      current: null,
      previous: null,
      comparison: {},
      trend: [],
    });

    const result = await getGoogleAnalyticsOrganicOverviewTool.handler(
      { projectId: "project_1", trend: "daily" },
      toolContext,
    );

    expect(textContent(result)).toEqual(
      "Organic overview for 2026-07-09 through 2026-08-05, compared with 2026-06-11 through 2026-07-08. The trend was cut at 0 rows; use trend=weekly or a shorter date range for the full series. No Organic Search rows for this date range.",
    );
  });
});
