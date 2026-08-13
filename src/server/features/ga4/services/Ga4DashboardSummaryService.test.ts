import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Ga4BatchRunReportsResponse,
  Ga4RunReportRequest,
  Ga4RunReportResponse,
} from "@/server/lib/ga4Client";
import {
  Ga4DataApiError,
  Ga4ReportError,
  toSafeGa4ReportErrorDetail,
} from "@/server/lib/ga4Errors";
import { makeGa4Connection } from "./ga4-test-fixtures";
import { Ga4DashboardSummaryService } from "./Ga4DashboardSummaryService";

const mocks = vi.hoisted(() => ({
  getByProjectId: vi.fn(),
  runReport:
    vi.fn<(request: Ga4RunReportRequest) => Promise<Ga4RunReportResponse>>(),
  batchRunReports:
    vi.fn<
      (requests: Ga4RunReportRequest[]) => Promise<Ga4BatchRunReportsResponse>
    >(),
}));

vi.mock("@/server/features/ga4/repositories/Ga4ConnectionRepository", () => ({
  Ga4ConnectionRepository: { getByProjectId: mocks.getByProjectId },
}));

vi.mock("@/server/lib/ga4Client", () => ({
  createGa4DataClient: () => ({ batchRunReports: mocks.batchRunReports }),
}));

const connection = makeGa4Connection();

function responseFor(
  request: Ga4RunReportRequest,
  input: Omit<Ga4RunReportResponse, "dimensionHeaders" | "metricHeaders"> = {},
): Ga4RunReportResponse {
  return {
    dimensionHeaders: request.dimensions.map(({ name }) => ({ name })),
    metricHeaders: request.metrics.map(({ name }) => ({ name })),
    ...input,
  };
}

function aggregateResponse(
  request: Ga4RunReportRequest,
  values: [string, string, string, string],
  input: Omit<
    Ga4RunReportResponse,
    "dimensionHeaders" | "metricHeaders" | "rows"
  > = {},
): Ga4RunReportResponse {
  return responseFor(request, {
    rows: [
      {
        dimensionValues: [],
        metricValues: values.map((value) => ({ value })),
      },
    ],
    rowCount: 1,
    ...input,
  });
}

function listResponse(
  request: Ga4RunReportRequest,
  rows: Array<[string | string[], string]>,
  input: Omit<
    Ga4RunReportResponse,
    "dimensionHeaders" | "metricHeaders" | "rows"
  > = {},
): Ga4RunReportResponse {
  return responseFor(request, {
    rows: rows.map(([dimension, metric]) => ({
      dimensionValues: (Array.isArray(dimension) ? dimension : [dimension]).map(
        (value) => ({ value }),
      ),
      metricValues: [{ value: metric }],
    })),
    rowCount: rows.length,
    ...input,
  });
}

describe("Ga4DashboardSummaryService", () => {
  beforeEach(() => {
    mocks.getByProjectId.mockResolvedValue(connection);
    mocks.batchRunReports.mockImplementation(async (requests) => ({
      reports: await Promise.all(
        requests.map((request) => mocks.runReport(request)),
      ),
    }));
  });

  it("batches four all-traffic reports for complete local periods", async () => {
    const pending: Array<{
      request: Ga4RunReportRequest;
      resolve: (response: Ga4RunReportResponse) => void;
    }> = [];
    mocks.runReport.mockImplementation(
      (request) =>
        new Promise((resolve) => {
          pending.push({ request, resolve });
        }),
    );

    const resultPromise = Ga4DashboardSummaryService.getDashboardGa4Summary(
      { projectId: "project_1" },
      { now: new Date("2026-08-06T15:00:00Z") },
    );
    await vi.waitFor(() => expect(pending).toHaveLength(4));

    for (const report of pending) {
      report.resolve(responseFor(report.request, { rowCount: 0 }));
    }
    const result = await resultPromise;

    expect(mocks.batchRunReports).toHaveBeenCalledTimes(1);

    expect(result.period).toEqual({
      startDate: "2026-07-09",
      endDate: "2026-08-05",
      previousStartDate: "2026-06-11",
      previousEndDate: "2026-07-08",
    });
    expect(result.property).toEqual({
      id: "properties/123",
      displayName: "Example",
      timeZone: "America/New_York",
    });
    const [current, previous, pages, cities] = pending.map(
      ({ request }) => request,
    );
    expect(current).toMatchObject({
      dateRanges: [{ startDate: "2026-07-09", endDate: "2026-08-05" }],
      dimensions: [],
      metrics: [
        { name: "sessions" },
        { name: "keyEvents" },
        { name: "sessionKeyEventRate" },
        { name: "engagementRate" },
      ],
      limit: "1",
      orderBys: [],
      keepEmptyRows: false,
      returnPropertyQuota: true,
    });
    expect(previous?.dateRanges).toEqual([
      { startDate: "2026-06-11", endDate: "2026-07-08" },
    ]);
    expect(pages).toMatchObject({
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }],
      limit: "10",
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
    });
    expect(cities).toMatchObject({
      dimensions: [{ name: "city" }],
      metrics: [{ name: "sessions" }],
      limit: "10",
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    });
    for (const reportRequest of pending.map(({ request }) => request)) {
      expect(reportRequest.dimensionFilter).toBeUndefined();
    }
  });

  it("returns previous-period values and shaped top lists", async () => {
    mocks.runReport.mockImplementation(async (request) => {
      const dimension = request.dimensions[0]?.name;
      if (request.dimensions.some(({ name }) => name === "pagePath")) {
        return listResponse(request, [
          ["/guides/seo", "40"],
          ["/", "30"],
        ]);
      }
      if (dimension === "city") {
        return listResponse(request, [
          ["Manila", "25"],
          ["Dallas", "12"],
        ]);
      }
      return request.dateRanges[0]?.startDate === "2026-07-09"
        ? aggregateResponse(request, ["100", "10", "0.1", "0.7"])
        : aggregateResponse(request, ["80", "5", "0.0625", "0.625"]);
    });

    const result = await Ga4DashboardSummaryService.getDashboardGa4Summary(
      { projectId: "project_1" },
      { now: new Date("2026-08-06T15:00:00Z") },
    );

    expect(result.metrics).toEqual({
      visits: 100,
      conversions: 10,
      conversionRate: 0.1,
      engagementRate: 0.7,
    });
    expect(result.previous).toEqual({ visits: 80, conversions: 5 });
    expect(result.topPages).toEqual([
      { path: "/guides/seo", views: 40 },
      { path: "/", views: 30 },
    ]);
    expect(result.topCities).toEqual([
      { city: "Manila", visits: 25 },
      { city: "Dallas", visits: 12 },
    ]);
  });

  it("drops blank and not-set list dimensions before taking three", async () => {
    mocks.runReport.mockImplementation(async (request) => {
      const dimension = request.dimensions[0]?.name;
      if (request.dimensions.some(({ name }) => name === "pagePath")) {
        return listResponse(request, [
          ["", "100"],
          ["(not set)", "90"],
          ["   ", "80"],
          [" /one ", "70"],
          ["/two", "60"],
          ["/three", "50"],
          ["/four", "40"],
        ]);
      }
      if (dimension === "city") {
        return listResponse(request, [
          ["(NOT SET)", "100"],
          ["", "90"],
          [" Manila ", "80"],
          ["Dallas", "70"],
          ["Cebu", "60"],
          ["Austin", "50"],
        ]);
      }
      return aggregateResponse(request, ["0", "0", "0", "0"]);
    });

    const result = await Ga4DashboardSummaryService.getDashboardGa4Summary(
      { projectId: "project_1" },
      { now: new Date("2026-08-06T15:00:00Z") },
    );

    expect(result.topPages.map(({ path }) => path)).toEqual([
      "/one",
      "/two",
      "/three",
    ]);
    expect(result.topCities.map(({ city }) => city)).toEqual([
      "Manila",
      "Dallas",
      "Cebu",
    ]);
  });

  it("uses zero for missing aggregate data while retaining restricted nulls", async () => {
    let aggregateCall = 0;
    mocks.runReport.mockImplementation(async (request) => {
      if (request.dimensions.length > 0) {
        return responseFor(request, { rowCount: 0 });
      }
      aggregateCall += 1;
      return responseFor(request, {
        rowCount: 0,
        metadata:
          aggregateCall === 1
            ? {
                schemaRestrictionResponse: {
                  activeMetricRestrictions: [
                    {
                      metricName: "keyEvents",
                      restrictedMetricTypes: ["COST_DATA"],
                    },
                  ],
                },
              }
            : undefined,
      });
    });

    const result = await Ga4DashboardSummaryService.getDashboardGa4Summary(
      { projectId: "project_1" },
      { now: new Date("2026-08-06T15:00:00Z") },
    );

    expect(result.metrics).toEqual({
      visits: 0,
      conversions: null,
      conversionRate: 0,
      engagementRate: 0,
    });
    expect(result.previous).toEqual({ visits: 0, conversions: 0 });
    expect(result.quota.current.reportMetadata.restrictedMetrics).toEqual([
      { metricName: "keyEvents", restrictedMetricTypes: ["COST_DATA"] },
    ]);
  });

  it("keeps limitation and quota context on every report section", async () => {
    let aggregateCall = 0;
    mocks.runReport.mockImplementation(async (request) => {
      const dimension = request.dimensions[0]?.name;
      if (request.dimensions.some(({ name }) => name === "pagePath")) {
        return listResponse(request, [["/", "5"]], {
          metadata: { dataLossFromOtherRow: true },
          propertyQuota: {
            tokensPerDay: { consumed: 3, remaining: 97 },
          },
        });
      }
      if (dimension === "city") {
        return listResponse(request, [["Manila", "4"]], {
          metadata: { subjectToThresholding: true },
          propertyQuota: {
            tokensPerHour: { consumed: 4, remaining: 96 },
          },
        });
      }
      aggregateCall += 1;
      return aggregateResponse(request, ["1", "1", "1", "1"], {
        metadata:
          aggregateCall === 1
            ? { subjectToThresholding: true }
            : {
                samplingMetadatas: [
                  { samplesReadCount: "10", samplingSpaceSize: "100" },
                ],
              },
        propertyQuota:
          aggregateCall === 1
            ? { concurrentRequests: { consumed: 1, remaining: 9 } }
            : { tokensPerHour: { consumed: 2, remaining: 98 } },
      });
    });

    const result = await Ga4DashboardSummaryService.getDashboardGa4Summary(
      { projectId: "project_1" },
      { now: new Date("2026-08-06T15:00:00Z") },
    );

    expect(result.limitedData).toEqual({
      summary: true,
      pages: true,
      cities: true,
    });
    expect(result.quota.current).toMatchObject({
      reportMetadata: { hasLimitedData: true, subjectToThresholding: true },
      quota: { concurrentRequests: { consumed: 1, remaining: 9 } },
    });
    expect(result.quota.previous).toMatchObject({
      reportMetadata: {
        hasLimitedData: true,
        sampling: [{ samplesReadCount: "10", samplingSpaceSize: "100" }],
      },
      quota: { tokensPerHour: { consumed: 2, remaining: 98 } },
    });
    expect(result.quota.pages).toMatchObject({
      reportMetadata: { hasLimitedData: true, dataLossFromOtherRow: true },
      quota: { tokensPerDay: { consumed: 3, remaining: 97 } },
    });
    expect(result.quota.cities).toMatchObject({
      reportMetadata: { hasLimitedData: true, subjectToThresholding: true },
      quota: { tokensPerHour: { consumed: 4, remaining: 96 } },
    });
  });

  it("rejects a batch response with missing logical reports", async () => {
    mocks.batchRunReports.mockResolvedValueOnce({ reports: [] });

    await expect(
      Ga4DashboardSummaryService.getDashboardGa4Summary({
        projectId: "project_1",
      }),
    ).rejects.toMatchObject({ code: "ga4_malformed_response" });
  });

  it("maps connection and quota failures to stable reporting errors", async () => {
    mocks.getByProjectId.mockResolvedValueOnce(null);
    await expect(
      Ga4DashboardSummaryService.getDashboardGa4Summary({
        projectId: "project_1",
      }),
    ).rejects.toMatchObject({ code: "ga4_not_connected" });

    mocks.runReport.mockRejectedValueOnce(
      new Ga4DataApiError(429, "unsafe upstream body", 90),
    );
    await expect(
      Ga4DashboardSummaryService.getDashboardGa4Summary({
        projectId: "project_1",
      }),
    ).rejects.toMatchObject({
      code: "ga4_quota_exhausted",
      retryAfterSeconds: 90,
    });
  });
});

describe("toSafeGa4ReportErrorDetail", () => {
  it("retains only the stable error contract and optional retry hint", () => {
    expect(
      toSafeGa4ReportErrorDetail(
        new Ga4ReportError("ga4_quota_exhausted", "Try later.", 45),
      ),
    ).toEqual({
      code: "ga4_quota_exhausted",
      message: "Try later.",
      retryAfterSeconds: 45,
    });
  });

  it("does not expose unexpected exception messages", () => {
    expect(
      toSafeGa4ReportErrorDetail(
        new Error("secret-token and raw Google response"),
      ),
    ).toEqual({
      code: "ga4_upstream_unavailable",
      message: "Google Analytics reporting is temporarily unavailable.",
    });
  });
});
