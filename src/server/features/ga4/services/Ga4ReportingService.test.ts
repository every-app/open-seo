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

  it("clamps explicit dates and nulls restricted metrics", async () => {
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
      startDate: "2026-05-08",
      endDate: "2026-08-05",
    });
    expect(result.warnings).toEqual(["end_date_clamped", "start_date_clamped"]);
    expect(result.rows[0]?.purchaseRevenue).toBeNull();
  });

  it("uses the all-channel page report and optional date dimension", async () => {
    mocks.runReport.mockResolvedValue({
      dimensionHeaders: [
        { name: "hostName" },
        { name: "pagePath" },
        { name: "date" },
      ],
      metricHeaders: [
        "screenPageViews",
        "activeUsers",
        "userEngagementDuration",
        "keyEvents",
      ].map((name) => ({ name })),
      rowCount: 0,
    });
    await Ga4ReportingService.runReport(
      {
        projectId: "project_1",
        kind: "page_performance",
        channel: "all",
        includeDate: true,
      },
      { now: new Date("2026-08-06T15:00:00Z") },
    );
    expect(mocks.runReport).toHaveBeenCalledWith(
      expect.objectContaining({
        dimensions: [
          { name: "hostName" },
          { name: "pagePath" },
          { name: "date" },
        ],
        dimensionFilter: undefined,
      }),
    );
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

  it.each([
    [
      "traffic_acquisition",
      { acquisitionBreakdown: "source_medium", channel: "all" },
      "sessionSourceMedium",
      [
        "sessions",
        "activeUsers",
        "engagedSessions",
        "engagementRate",
        "keyEvents",
        "transactions",
        "purchaseRevenue",
      ],
    ],
    [
      "ecommerce_performance",
      { ecommerceBreakdown: "item", channel: "organic_search" },
      "itemName",
      ["itemsViewed", "itemsAddedToCart", "itemsPurchased", "itemRevenue"],
    ],
    [
      "site_search",
      { channel: "all" },
      "searchTerm",
      [
        "eventCount",
        "activeUsers",
        "sessions",
        "engagedSessions",
        "engagementRate",
      ],
    ],
    [
      "audience_breakdown",
      { audienceBreakdown: "new_vs_returning", channel: "organic_search" },
      "newVsReturning",
      ["activeUsers", "sessions", "engagementRate", "keyEvents"],
    ],
  ] as const)(
    "builds the fixed %s report",
    async (kind, options, dimension, metrics) => {
      mocks.runReport.mockResolvedValue({
        dimensionHeaders:
          kind === "ecommerce_performance"
            ? [{ name: "itemName" }, { name: "itemId" }]
            : [{ name: dimension }],
        metricHeaders: metrics.map((name) => ({ name })),
        rowCount: 0,
      });
      await Ga4ReportingService.runReport(
        { projectId: "project_1", kind, ...options },
        { now: new Date("2026-08-06T15:00:00Z") },
      );
      const request = mocks.runReport.mock.calls[0]?.[0];
      expect(request?.dimensions[0]?.name).toBe(dimension);
      expect(request?.metrics).toEqual(metrics.map((name) => ({ name })));
      if (kind === "site_search") {
        expect(request?.dimensionFilter).toEqual({
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
                    stringFilter: {
                      matchType: "EXACT",
                      value: "(not set)",
                    },
                  },
                },
              },
            ],
          },
        });
      }
    },
  );

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
