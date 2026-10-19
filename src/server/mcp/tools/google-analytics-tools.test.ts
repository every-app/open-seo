/* eslint-disable max-lines, max-lines-per-function -- one spec covers every GA4 MCP tool */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeGa4ReportResult } from "@/server/features/ga4/services/ga4-test-fixtures";
import { Ga4ReportError } from "@/server/lib/ga4Errors";
import { GscApiError } from "@/server/lib/gscErrors";
import * as tools from "./google-analytics-tools";
import { makeToolContext, textContent } from "./tool-test-support";

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
const page = { projectId: "project_1", limit: 100, offset: 0 };

describe("Google Analytics MCP tools", () => {
  beforeEach(() => {
    mocks.runReport.mockResolvedValue(
      makeGa4ReportResult({
        rowCount: 1,
        totalRowCount: 1,
        rows: [{ hostName: "example.com", sessions: 5 }],
      }),
    );
    mocks.getProjectForOrganization.mockResolvedValue({ id: "project_1" });
  });

  // Each tool maps its public input onto the shared report input: fixed
  // `kind`, forced channels, and the per-report breakdown key.
  it.each([
    [
      "landing_pages",
      () =>
        tools.getGoogleAnalyticsOrganicLandingPagesTool.handler(
          page,
          toolContext,
        ),
      { kind: "landing_pages", channel: "organic_search" },
    ],
    [
      "page_performance",
      () =>
        tools.getGoogleAnalyticsPagePerformanceTool.handler(
          { ...page, includeDate: true, channel: "all" },
          toolContext,
        ),
      { kind: "page_performance", includeDate: true, channel: "all" },
    ],
    [
      "key_events",
      () =>
        tools.getGoogleAnalyticsKeyEventsTool.handler(
          {
            ...page,
            breakdown: "event_and_landing_page",
            channel: "organic_search",
            comparePreviousPeriod: false,
          },
          toolContext,
        ),
      {
        kind: "key_events",
        breakdown: "event_and_landing_page",
        channel: "organic_search",
        comparePreviousPeriod: false,
      },
    ],
    [
      "traffic_acquisition",
      () =>
        tools.getGoogleAnalyticsTrafficAcquisitionTool.handler(
          { ...page, breakdown: "campaign", comparePreviousPeriod: false },
          toolContext,
        ),
      {
        kind: "traffic_acquisition",
        channel: "all",
        acquisitionBreakdown: "campaign",
        comparePreviousPeriod: false,
      },
    ],
    [
      "ecommerce_performance",
      () =>
        tools.getGoogleAnalyticsEcommercePerformanceTool.handler(
          {
            ...page,
            breakdown: "landing_page",
            channel: "organic_search",
            onlyWithTransactions: true,
          },
          toolContext,
        ),
      {
        kind: "ecommerce_performance",
        channel: "organic_search",
        ecommerceBreakdown: "landing_page",
        ecommerceOnlyWithTransactions: true,
        onlyWithTransactions: true,
      },
    ],
    [
      "site_search",
      () => tools.getGoogleAnalyticsSiteSearchTool.handler(page, toolContext),
      { kind: "site_search", channel: "all" },
    ],
    [
      "audience_breakdown",
      () =>
        tools.getGoogleAnalyticsAudienceBreakdownTool.handler(
          {
            ...page,
            breakdown: "country",
            channel: "all",
            comparePreviousPeriod: false,
          },
          toolContext,
        ),
      {
        kind: "audience_breakdown",
        channel: "all",
        audienceBreakdown: "country",
        comparePreviousPeriod: false,
      },
    ],
  ] as const)(
    "maps the %s tool onto its fixed report input",
    async (_kind, run, input) => {
      const result = await run();

      expect(mocks.runReport).toHaveBeenCalledExactlyOnceWith({
        ...page,
        ...input,
      });
      expect(result.structuredContent).toMatchObject({
        status: "ok",
        rowCount: 1,
        meta: { projectId: "project_1" },
      });
    },
  );

  it("returns stable connection errors without leaking upstream details", async () => {
    mocks.runReport.mockRejectedValue(
      new Ga4ReportError(
        "ga4_reconnect_required",
        "The Google Analytics connection has expired or was revoked.",
      ),
    );

    const result = await tools.getGoogleAnalyticsKeyEventsTool.handler(
      {
        ...page,
        breakdown: "event",
        channel: "organic_search",
        comparePreviousPeriod: false,
      },
      toolContext,
    );

    expect(result.structuredContent).toMatchObject({
      status: "error",
      error: {
        code: "ga4_reconnect_required",
        actionUrl: "https://open-seo.test/p/project_1/settings/integrations",
      },
    });
  });

  it("returns the cross-source opportunity envelope and renders ranked rows", async () => {
    mocks.getOpportunities.mockResolvedValue({
      status: "ok",
      rowCount: 2,
      totalCandidateRows: 2,
      request: {
        dateRange: { startDate: "2026-07-01", endDate: "2026-07-28" },
      },
      rows: [
        {
          page: "https://example.com/a",
          clicks: 12,
          impressions: 900,
          ctr: 0.013,
          position: 8.4,
          joinStatus: "joined",
          ga4: { sessions: 40, keyEvents: 3, engagementRate: 0.62 },
          score: 90,
        },
        {
          page: "https://example.com/b",
          clicks: 1,
          impressions: 120,
          ctr: 0.008,
          position: 14,
          joinStatus: "gsc_only",
          ga4: null,
          score: null,
        },
      ],
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
      rowCount: 2,
      totalCandidateRows: 2,
    });
    expect(textContent(result)).toEqual(
      [
        "Search opportunities for 2026-07-01 through 2026-07-28: 2 returned from 2 candidates. 1 candidates matched GA4 landing pages.",
        "score | page | position | impressions | clicks | CTR | sessions | keyEvents | engagementRate | match",
        "90 | https://example.com/a | 8.4 | 900 | 12 | 1.3% | 40 | 3 | 0.62 | joined",
        "— | https://example.com/b | 14.0 | 120 | 1 | 0.8% | — | — | — | gsc_only",
      ].join("\n"),
    );
  });

  it("reports a disabled Search Console API instead of asking to reconnect", async () => {
    mocks.getOpportunities.mockRejectedValue(
      new GscApiError(403, "denied", "SERVICE_DISABLED"),
    );

    const result = await tools.getSearchOpportunitiesTool.handler(
      { projectId: "project_1", limit: 25 },
      toolContext,
    );

    expect(result.structuredContent).toMatchObject({
      status: "error",
      error: { code: "gsc_api_disabled" },
    });
  });

  it("renders measurement-health issues and the stream inventory", async () => {
    mocks.getMeasurementHealth.mockResolvedValue({
      status: "ok",
      summary: { webStreamCount: 1, keyEventCount: 1, issueCount: 1 },
      issues: ["site_search_measurement_disabled"],
      webStreams: [
        {
          streamId: "111",
          displayName: "Example site",
          measurementId: "G-ABC123",
          defaultUri: "https://example.com",
          enhancedMeasurement: {
            streamEnabled: true,
            siteSearchEnabled: false,
          },
        },
      ],
      otherStreams: [],
      keyEvents: [{ eventName: "purchase", countingMethod: "ONCE_PER_EVENT" }],
      customDefinitions: {
        dimensions: [
          { parameterName: "plan", displayName: "Plan", scope: "EVENT" },
        ],
        metrics: [],
      },
    });
    const { getGoogleAnalyticsMeasurementHealthTool } = tools;
    const result = await getGoogleAnalyticsMeasurementHealthTool.handler(
      { projectId: "project_1" },
      toolContext,
    );
    expect(textContent(result)).toEqual(
      [
        "Measurement health: 1 web stream(s), 1 key event(s), and 1 diagnostic issue(s). Issues: site_search_measurement_disabled.",
        "Web streams:",
        "streamId | displayName | measurementId | defaultUri | enhancedMeasurement | siteSearch",
        "111 | Example site | G-ABC123 | https://example.com | yes | no",
        "Key events:",
        "eventName | countingMethod | custom",
        "purchase | ONCE_PER_EVENT | no",
        "Custom dimensions:",
        "parameterName | displayName | scope",
        "plan | Plan | EVENT",
      ].join("\n"),
    );
  });

  it("renders report diagnostics and previous-period deltas", async () => {
    mocks.runReport.mockResolvedValue(
      makeGa4ReportResult({
        rowCount: 1,
        totalRowCount: 1,
        rows: [{ sessionDefaultChannelGroup: "Organic Search", sessions: 120 }],
        request: {
          reportKind: "traffic_acquisition",
          channel: "all",
          dimensions: ["sessionDefaultChannelGroup"],
          metrics: ["sessions"],
        },
        diagnostics: [
          {
            code: "attribution_not_set_share_high",
            severity: "warning",
            message: "A notable share of sessions has no source/medium.",
            evidence: { sessions: 30, totalSessions: 150, share: 0.2 },
          },
        ],
        comparison: {
          previousDateRange: {
            startDate: "2026-06-11",
            endDate: "2026-07-08",
          },
          dimensions: ["sessionDefaultChannelGroup"],
          metrics: ["sessions"],
          rows: [
            {
              dimensions: { sessionDefaultChannelGroup: "Organic Search" },
              metrics: {
                sessions: {
                  current: 120,
                  previous: 100,
                  absoluteChange: 20,
                  percentChange: 0.2,
                },
              },
            },
          ],
          coverage: {
            complete: true,
            current: { fetchedRowCount: 1, totalRowCount: 1 },
            previous: { fetchedRowCount: 1, totalRowCount: 1 },
          },
          reportMetadata: {
            hasLimitedData: false,
            current: makeGa4ReportResult().reportMetadata,
            previous: makeGa4ReportResult().reportMetadata,
          },
          quota: null,
        },
      }),
    );

    const result = await tools.getGoogleAnalyticsTrafficAcquisitionTool.handler(
      {
        projectId: "project_1",
        breakdown: "channel_group",
        comparePreviousPeriod: true,
        limit: 100,
        offset: 0,
      },
      toolContext,
    );

    expect(textContent(result)).toEqual(
      [
        "Traffic acquisition: 1 of 1 rows for 2026-07-09 through 2026-08-05.",
        "sessionDefaultChannelGroup | sessions",
        "Organic Search | 120",
        "Diagnostics:",
        "severity | code | message | evidence",
        'warning | attribution_not_set_share_high | A notable share of sessions has no source/medium. | {"sessions":30,"totalSessions":150,"share":0.2}',
        "Compared with 2026-06-11 through 2026-07-08 (current vs previous):",
        "sessionDefaultChannelGroup | sessions",
        "Organic Search | 120 vs 100 (+20.0%)",
      ].join("\n"),
    );
  });

  it("renders the requested overview trend series and its diagnostics", async () => {
    mocks.getOrganicOverview.mockResolvedValue({
      status: "ok",
      request: {
        resolvedDateRange: { startDate: "2026-07-09", endDate: "2026-08-05" },
        previousDateRange: { startDate: "2026-06-11", endDate: "2026-07-08" },
        trend: "weekly",
      },
      warnings: [],
      current: { sessions: 120, keyEvents: 2 },
      previous: { sessions: 100, keyEvents: 9 },
      comparison: {},
      trend: [
        { yearWeek: "202628", sessions: 60, keyEvents: 1 },
        { yearWeek: "202629", sessions: 60, keyEvents: 1 },
      ],
      diagnostics: [
        {
          code: "key_events_sharp_decline",
          severity: "warning",
          message: "Organic key events declined sharply.",
          evidence: { current: 2, previous: 9, percentChange: -0.78 },
        },
      ],
    });

    const result = await tools.getGoogleAnalyticsOrganicOverviewTool.handler(
      { projectId: "project_1", trend: "weekly" },
      toolContext,
    );

    const out = textContent(result);
    expect(out).toContain(
      "warning | key_events_sharp_decline | Organic key events declined sharply.",
    );
    expect(out).toContain("Weekly trend:");
    expect(out).toContain(
      "yearWeek | sessions | activeUsers | engagedSessions | engagementRate | keyEvents | transactions | purchaseRevenue",
    );
    expect(out).toContain("202628 | 60 | — | — | — | 1 | — | —");
    expect(out).toContain("202629 | 60 | — | — | — | 1 | — | —");
  });
});
