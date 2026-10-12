import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeGa4ReportResult } from "@/server/features/ga4/services/ga4-test-fixtures";
import { Ga4ReportError } from "@/server/lib/ga4Errors";
import * as tools from "./google-analytics-tools";
import { makeToolContext } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  runReport: vi.fn(),
  getProjectForOrganization: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/ga4/services/Ga4ReportingService", () => ({
  Ga4ReportingService: {
    runReport: mocks.runReport,
  },
}));
vi.mock("@/server/features/ga4/services/Ga4OrganicOverviewService", () => ({
  Ga4OrganicOverviewService: { getOrganicOverview: vi.fn() },
}));
vi.mock("@/server/features/ga4/services/Ga4MeasurementHealthService", () => ({
  Ga4MeasurementHealthService: { getMeasurementHealth: vi.fn() },
}));
vi.mock("@/server/features/ga4/services/SearchOpportunityService", () => ({
  SearchOpportunityService: { getOpportunities: vi.fn() },
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
});
