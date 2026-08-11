import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeGa4ReportResult } from "@/server/features/ga4/services/ga4-test-fixtures";
import { Ga4ReportError } from "@/server/lib/ga4Errors";
import * as tools from "./google-analytics-tools";
import { makeToolContext } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  runReport: vi.fn(),
  getOrganicOverview: vi.fn(),
  getMeasurementHealth: vi.fn(),
  getOpportunities: vi.fn(),
  getProjectForOrganization: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/ga4/services/Ga4ReportingService", () => ({
  Ga4ReportingService: {
    runReport: mocks.runReport,
  },
}));
vi.mock("@/server/features/ga4/services/Ga4OrganicOverviewService", () => ({
  Ga4OrganicOverviewService: {
    getOrganicOverview: mocks.getOrganicOverview,
  },
}));
vi.mock("@/server/features/ga4/services/Ga4MeasurementHealthService", () => ({
  Ga4MeasurementHealthService: {
    getMeasurementHealth: mocks.getMeasurementHealth,
  },
}));
vi.mock("@/server/features/ga4/services/SearchOpportunityService", () => ({
  SearchOpportunityService: { getOpportunities: mocks.getOpportunities },
}));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));

const toolContext = makeToolContext();
const reportResult = makeGa4ReportResult({
  rowCount: 1,
  totalRowCount: 1,
  rows: [{ hostName: "example.com", sessions: 5 }],
});

describe("Google Analytics MCP tools", () => {
  beforeEach(() => {
    mocks.runReport.mockResolvedValue(reportResult);
    mocks.getProjectForOrganization.mockResolvedValue({ id: "project_1" });
  });

  it("registers strict public input schemas", async () => {
    const { getGoogleAnalyticsOrganicLandingPagesTool } = tools;
    expect(
      getGoogleAnalyticsOrganicLandingPagesTool.config.inputSchema.safeParse({
        projectId: "project_1",
        unknown: true,
      }).success,
    ).toBe(false);
    expect(
      getGoogleAnalyticsOrganicLandingPagesTool.config.inputSchema.safeParse({
        projectId: "project_1",
        startDate: "2026-01-01",
      }).success,
    ).toBe(true);
  });

  it("returns normalized landing-page report content", async () => {
    const { getGoogleAnalyticsOrganicLandingPagesTool } = tools;
    const result = await getGoogleAnalyticsOrganicLandingPagesTool.handler(
      { projectId: "project_1", limit: 10, offset: 0 },
      toolContext,
    );
    expect(mocks.runReport).toHaveBeenCalledWith({
      projectId: "project_1",
      limit: 10,
      offset: 0,
      kind: "landing_pages",
      channel: "organic_search",
    });
    expect(result.structuredContent).toMatchObject({
      status: "ok",
      rowCount: 1,
      meta: { projectId: "project_1", organizationId: "org_123" },
    });
  });

  it("maps page-performance and key-event options to fixed reports", async () => {
    const {
      getGoogleAnalyticsKeyEventsTool,
      getGoogleAnalyticsPagePerformanceTool,
    } = tools;
    await getGoogleAnalyticsPagePerformanceTool.handler(
      {
        projectId: "project_1",
        includeDate: true,
        channel: "all",
        limit: 100,
        offset: 0,
      },
      toolContext,
    );
    await getGoogleAnalyticsKeyEventsTool.handler(
      {
        projectId: "project_1",
        breakdown: "event_and_landing_page",
        channel: "organic_search",
        comparePreviousPeriod: false,
        limit: 100,
        offset: 0,
      },
      toolContext,
    );
    expect(mocks.runReport).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        kind: "page_performance",
        includeDate: true,
        channel: "all",
      }),
    );
    expect(mocks.runReport).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        kind: "key_events",
        breakdown: "event_and_landing_page",
      }),
    );
  });

  it("returns stable connection errors without leaking upstream details", async () => {
    mocks.runReport.mockRejectedValue(
      new Ga4ReportError(
        "ga4_reconnect_required",
        "The Google Analytics connection has expired or was revoked.",
      ),
    );
    const { getGoogleAnalyticsKeyEventsTool } = tools;
    const result = await getGoogleAnalyticsKeyEventsTool.handler(
      {
        projectId: "project_1",
        breakdown: "event",
        channel: "organic_search",
        comparePreviousPeriod: false,
        limit: 100,
        offset: 0,
      },
      toolContext,
    );
    expect(result.structuredContent).toMatchObject({
      status: "error",
      error: {
        code: "ga4_reconnect_required",
        actionUrl: "https://open-seo.test/p/project_1/settings",
      },
    });
  });

  it("returns the cross-source opportunity envelope", async () => {
    mocks.getOpportunities.mockResolvedValue({
      status: "ok",
      rowCount: 1,
      totalCandidateRows: 2,
      rows: [{ page: "https://example.com/a", score: 90 }],
      coverage: { matchedRows: 1 },
    });
    const { getSearchOpportunitiesTool } = tools;
    const result = await getSearchOpportunitiesTool.handler(
      { projectId: "project_1", limit: 25 },
      toolContext,
    );
    expect(mocks.getOpportunities).toHaveBeenCalledWith({
      projectId: "project_1",
      limit: 25,
    });
    expect(result.structuredContent).toMatchObject({
      status: "ok",
      rowCount: 1,
      totalCandidateRows: 2,
    });
  });

  it.each([
    [
      "traffic_acquisition",
      () =>
        tools.getGoogleAnalyticsTrafficAcquisitionTool.handler(
          {
            projectId: "project_1",
            breakdown: "campaign",
            comparePreviousPeriod: false,
            limit: 100,
            offset: 0,
          },
          toolContext,
        ),
    ],
    [
      "ecommerce_performance",
      () =>
        tools.getGoogleAnalyticsEcommercePerformanceTool.handler(
          {
            projectId: "project_1",
            breakdown: "landing_page",
            channel: "organic_search",
            onlyWithTransactions: false,
            limit: 100,
            offset: 0,
          },
          toolContext,
        ),
    ],
    [
      "site_search",
      () =>
        tools.getGoogleAnalyticsSiteSearchTool.handler(
          { projectId: "project_1", limit: 100, offset: 0 },
          toolContext,
        ),
    ],
    [
      "audience_breakdown",
      () =>
        tools.getGoogleAnalyticsAudienceBreakdownTool.handler(
          {
            projectId: "project_1",
            breakdown: "country",
            channel: "all",
            comparePreviousPeriod: false,
            limit: 100,
            offset: 0,
          },
          toolContext,
        ),
    ],
  ] as const)(
    "maps a controlled breakdown to %s",
    async (expectedKind, run) => {
      await run();
      expect(mocks.runReport).toHaveBeenCalledWith(
        expect.objectContaining({ kind: expectedKind }),
      );
    },
  );

  it("returns organic overview and measurement-health envelopes", async () => {
    mocks.getOrganicOverview.mockResolvedValue({
      status: "ok",
      request: {
        resolvedDateRange: { startDate: "2026-07-09", endDate: "2026-08-05" },
        previousDateRange: { startDate: "2026-06-11", endDate: "2026-07-08" },
      },
      comparison: {},
      trend: [],
    });
    mocks.getMeasurementHealth.mockResolvedValue({
      status: "ok",
      summary: { webStreamCount: 1, keyEventCount: 2, issueCount: 0 },
      issues: [],
    });
    const {
      getGoogleAnalyticsMeasurementHealthTool,
      getGoogleAnalyticsOrganicOverviewTool,
    } = tools;
    const overview = await getGoogleAnalyticsOrganicOverviewTool.handler(
      { projectId: "project_1", trend: "weekly" },
      toolContext,
    );
    const health = await getGoogleAnalyticsMeasurementHealthTool.handler(
      { projectId: "project_1" },
      toolContext,
    );
    expect(mocks.getOrganicOverview).toHaveBeenCalledWith({
      projectId: "project_1",
      trend: "weekly",
    });
    expect(mocks.getMeasurementHealth).toHaveBeenCalledWith("project_1");
    expect(overview.structuredContent).toMatchObject({ status: "ok" });
    expect(health.structuredContent).toMatchObject({ status: "ok" });
  });

  it("rejects incomplete success and error envelopes", async () => {
    const {
      getGoogleAnalyticsMeasurementHealthTool,
      getGoogleAnalyticsOrganicLandingPagesTool,
      getGoogleAnalyticsOrganicOverviewTool,
      getSearchOpportunitiesTool,
    } = tools;

    for (const tool of [
      getGoogleAnalyticsOrganicLandingPagesTool,
      getGoogleAnalyticsOrganicOverviewTool,
      getGoogleAnalyticsMeasurementHealthTool,
      getSearchOpportunitiesTool,
    ]) {
      expect(tool.config.outputSchema.safeParse({ status: "ok" }).success).toBe(
        false,
      );
      expect(
        tool.config.outputSchema.safeParse({ status: "error" }).success,
      ).toBe(false);
      expect(
        tool.config.outputSchema.safeParse({
          status: "error",
          error: { code: "ga4_not_connected", message: "Connect GA4." },
          additiveField: true,
        }).success,
      ).toBe(true);
    }
  });
});
