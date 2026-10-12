import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Ga4RunReportRequest,
  Ga4RunReportResponse,
} from "@/server/lib/ga4Client";
import { Ga4DataApiError, Ga4ReportError } from "@/server/lib/ga4Errors";
import { makeGa4Connection } from "./ga4-test-fixtures";
import { Ga4ReportingService } from "./Ga4ReportingService";

const mocks = vi.hoisted(() => ({
  getByProjectId: vi.fn(),
  runReport:
    vi.fn<(request: Ga4RunReportRequest) => Promise<Ga4RunReportResponse>>(),
}));

vi.mock("@/server/features/ga4/repositories/Ga4ConnectionRepository", () => ({
  Ga4ConnectionRepository: { getByProjectId: mocks.getByProjectId },
}));

vi.mock("@/server/lib/ga4Client", () => ({
  createGa4DataClient: () => ({ runReport: mocks.runReport }),
}));

const connection = makeGa4Connection();

const landingHeaders = {
  dimensionHeaders: [{ name: "hostName" }, { name: "landingPage" }],
  metricHeaders: [
    "sessions",
    "activeUsers",
    "engagedSessions",
    "engagementRate",
    "keyEvents",
    "sessionKeyEventRate",
    "transactions",
    "purchaseRevenue",
  ].map((name) => ({ name })),
};

const acquisitionMetricNames = [
  "sessions",
  "activeUsers",
  "engagedSessions",
  "engagementRate",
  "keyEvents",
  "transactions",
  "purchaseRevenue",
];

function acquisitionResponse(
  start: number,
  length: number,
): Ga4RunReportResponse {
  return {
    dimensionHeaders: [{ name: "sessionSourceMedium" }],
    metricHeaders: acquisitionMetricNames.map((name) => ({ name })),
    rows: Array.from({ length }, (_, index) => ({
      dimensionValues: [{ value: `source-${start + index} / referral` }],
      metricValues: acquisitionMetricNames.map(() => ({ value: "1" })),
    })),
    rowCount: 1_100,
  };
}

const noComparison = {
  current: null,
  previous: null,
  absoluteChange: null,
  percentChange: null,
};

describe("Ga4ReportingService", () => {
  beforeEach(() => {
    mocks.getByProjectId.mockResolvedValue(connection);
  });

  it("builds and normalizes the organic landing-page report", async () => {
    mocks.runReport.mockResolvedValue({
      ...landingHeaders,
      rows: [
        {
          dimensionValues: [{ value: "example.com" }, { value: "/guides/seo" }],
          metricValues: ["20", "18", "14", "0.7", "3", "0.15", "1", "99.5"].map(
            (value) => ({ value }),
          ),
        },
      ],
      rowCount: 3,
      metadata: {
        subjectToThresholding: true,
        samplingMetadatas: [
          { samplesReadCount: "1000", samplingSpaceSize: "10000" },
        ],
      },
      propertyQuota: {
        tokensPerDay: { consumed: 10, remaining: 90 },
      },
    });
    const result = await Ga4ReportingService.runReport(
      {
        projectId: "project_1",
        kind: "landing_pages",
        limit: 1,
        offset: 1,
      },
      { now: new Date("2026-08-06T15:00:00Z") },
    );

    expect(mocks.runReport).toHaveBeenCalledWith(
      expect.objectContaining({
        dateRanges: [{ startDate: "2026-07-09", endDate: "2026-08-05" }],
        dimensionFilter: {
          filter: {
            fieldName: "sessionDefaultChannelGroup",
            stringFilter: { matchType: "EXACT", value: "Organic Search" },
          },
        },
        offset: "1",
        limit: "1",
      }),
    );
    expect(result.rows[0]).toMatchObject({
      hostName: "example.com",
      landingPage: "/guides/seo",
      sessions: 20,
      purchaseRevenue: 99.5,
    });
    expect(result.pageInfo).toEqual({
      offset: 1,
      limit: 1,
      hasMore: true,
      nextOffset: 2,
    });
    expect(result.reportMetadata.hasLimitedData).toBe(true);
    expect(result.quota?.tokensPerDay).toEqual({ consumed: 10, remaining: 90 });
    expect(result.request).toMatchObject({
      reportKind: "landing_pages",
      breakdown: "landing_page",
      dimensions: ["hostName", "landingPage"],
      flags: { includeDate: false, onlyWithTransactions: false },
    });
  });

  it("clamps a future endDate, keeps a long startDate, and nulls restricted metrics", async () => {
    mocks.runReport.mockResolvedValue({
      ...landingHeaders,
      rows: [
        {
          dimensionValues: [{ value: "example.com" }, { value: "/" }],
          metricValues: ["1", "1", "1", "1", "1", "1", "1", "0"].map(
            (value) => ({ value }),
          ),
        },
      ],
      rowCount: 1,
      metadata: {
        schemaRestrictionResponse: {
          activeMetricRestrictions: [
            {
              metricName: "purchaseRevenue",
              restrictedMetricTypes: ["COST_DATA"],
            },
          ],
        },
      },
    });
    const result = await Ga4ReportingService.runReport(
      {
        projectId: "project_1",
        kind: "landing_pages",
        startDate: "2025-01-01",
        endDate: "2026-08-20",
      },
      { now: new Date("2026-08-06T15:00:00Z") },
    );

    expect(result.request.resolvedDateRange).toEqual({
      startDate: "2025-01-01",
      endDate: "2026-08-05",
    });
    expect(result.warnings).toEqual(["end_date_clamped"]);
    expect(result.rows[0]?.purchaseRevenue).toBeNull();
  });

  it("returns stable connection and quota errors", async () => {
    mocks.getByProjectId.mockResolvedValueOnce(null);
    await expect(
      Ga4ReportingService.runReport({
        projectId: "project_1",
        kind: "landing_pages",
      }),
    ).rejects.toMatchObject({ code: "ga4_not_connected" });

    mocks.runReport.mockRejectedValueOnce(
      new Ga4DataApiError(429, "quota", 60),
    );
    const quotaFailure = Ga4ReportingService.runReport({
      projectId: "project_1",
      kind: "landing_pages",
    });
    await expect(quotaFailure).rejects.toBeInstanceOf(Ga4ReportError);
    await expect(quotaFailure).rejects.toMatchObject({
      code: "ga4_quota_exhausted",
      retryAfterSeconds: 60,
    });
  });

  it("rejects half-ranges and reversed dates before calling Google", async () => {
    await expect(
      Ga4ReportingService.runReport({
        projectId: "project_1",
        kind: "landing_pages",
        startDate: "2026-07-01",
      }),
    ).rejects.toMatchObject({ code: "validation_error" });
    await expect(
      Ga4ReportingService.runReport({
        projectId: "project_1",
        kind: "landing_pages",
        startDate: "2026-07-20",
        endDate: "2026-07-01",
      }),
    ).rejects.toMatchObject({ code: "validation_error" });
    expect(mocks.runReport).not.toHaveBeenCalled();
  });

  // The plain metric/dimension lists restate Ga4ReportDefinitions; these rows
  // cover the non-obvious request shapes each report kind adds.
  it.each([
    {
      name: "site_search keeps only real search terms",
      input: { kind: "site_search", channel: "all" },
      request: {
        dimensionFilter: {
          andGroup: {
            expressions: [
              {
                filter: {
                  fieldName: "eventName",
                  stringFilter: {
                    matchType: "EXACT",
                    value: "view_search_results",
                  },
                },
              },
              {
                notExpression: {
                  filter: {
                    fieldName: "searchTerm",
                    stringFilter: { matchType: "EXACT", value: "(not set)" },
                  },
                },
              },
            ],
          },
        },
      },
    },
    {
      name: "page_performance over all channels adds the date dimension",
      input: { kind: "page_performance", channel: "all", includeDate: true },
      request: {
        dimensions: [
          { name: "hostName" },
          { name: "pagePath" },
          { name: "date" },
        ],
        dimensionFilter: undefined,
      },
    },
    {
      name: "key_events drops events that never fired",
      input: { kind: "key_events", channel: "organic_search" },
      request: {
        metricFilter: {
          filter: {
            fieldName: "keyEvents",
            numericFilter: { operation: "GREATER_THAN" },
          },
        },
      },
    },
    {
      name: "ecommerce landing pages can be limited to those with transactions",
      input: {
        kind: "ecommerce_performance",
        ecommerceBreakdown: "landing_page",
        ecommerceOnlyWithTransactions: true,
        channel: "organic_search",
      },
      request: {
        dimensions: [{ name: "hostName" }, { name: "landingPage" }],
        metricFilter: {
          filter: {
            fieldName: "transactions",
            numericFilter: { operation: "GREATER_THAN" },
          },
        },
      },
    },
  ] as const)("builds the request: $name", async ({ input, request }) => {
    // A headerless response is a legitimately empty report.
    mocks.runReport.mockResolvedValue({});
    await Ga4ReportingService.runReport(
      { projectId: "project_1", ...input },
      { now: new Date("2026-08-06T15:00:00Z") },
    );
    expect(mocks.runReport.mock.calls[0]?.[0]).toMatchObject(request);
  });

  it("treats a headerless previous-period response as empty instead of malformed", async () => {
    mocks.runReport
      .mockResolvedValueOnce({
        dimensionHeaders: [{ name: "deviceCategory" }],
        metricHeaders: [
          "activeUsers",
          "sessions",
          "engagementRate",
          "keyEvents",
        ].map((name) => ({ name })),
        rows: [
          {
            dimensionValues: [{ value: "mobile" }],
            metricValues: ["10", "12", "0.5", "2"].map((value) => ({ value })),
          },
        ],
        rowCount: 1,
      })
      // GA4 omits headers and rows entirely when the previous-period window
      // falls before the property's creation date.
      .mockResolvedValueOnce({});

    const result = await Ga4ReportingService.runReport(
      {
        projectId: "project_1",
        kind: "audience_breakdown",
        audienceBreakdown: "device",
        comparePreviousPeriod: true,
      },
      { now: new Date("2026-08-06T15:00:00Z") },
    );

    expect(result.comparison?.rows).toEqual([
      {
        dimensions: { deviceCategory: "mobile" },
        metrics: {
          activeUsers: { ...noComparison, current: 10 },
          sessions: { ...noComparison, current: 12 },
          engagementRate: { ...noComparison, current: 0.5 },
          keyEvents: { ...noComparison, current: 2 },
        },
      },
    ]);
    expect(result.comparison?.coverage.previous).toEqual({
      fetchedRowCount: 0,
      totalRowCount: 0,
    });
  });

  describe("diagnostic pagination", () => {
    it.each([
      { offset: 950, hasMore: true, nextOffset: 1_050 },
      { offset: 1_000, hasMore: false, nextOffset: null },
    ])(
      "fetches the real page beyond the diagnostic buffer at offset $offset",
      async ({ offset, hasMore, nextOffset }) => {
        mocks.runReport
          .mockResolvedValueOnce(acquisitionResponse(0, 1_000))
          .mockResolvedValueOnce(acquisitionResponse(offset, 100));

        const result = await Ga4ReportingService.runReport(
          {
            projectId: "project_1",
            kind: "traffic_acquisition",
            acquisitionBreakdown: "source_medium",
            channel: "all",
            offset,
            limit: 100,
          },
          { now: new Date("2026-08-06T15:00:00Z") },
        );

        expect(mocks.runReport).toHaveBeenCalledTimes(2);
        expect(mocks.runReport.mock.calls[1]?.[0]).toMatchObject({
          offset: String(offset),
          limit: "100",
        });
        expect(result.rows).toHaveLength(100);
        expect(result.rows[0]?.sessionSourceMedium).toBe(
          `source-${offset} / referral`,
        );
        expect(result.pageInfo).toEqual({
          offset,
          limit: 100,
          hasMore,
          nextOffset,
        });
        expect(result).toMatchObject({
          diagnosticCoverage: {
            complete: false,
            fetchedRowCount: 1_000,
            totalRowCount: 1_100,
          },
        });
      },
    );
  });
});
