import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Ga4BatchRunReportsResponse,
  Ga4RunReportRequest,
  Ga4RunReportResponse,
} from "@/server/lib/ga4Client";
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

function responseFor(
  request: Ga4RunReportRequest,
  rows: Array<[string, string, string]> = [],
  input: Omit<
    Ga4RunReportResponse,
    "dimensionHeaders" | "metricHeaders" | "rows"
  > = {},
): Ga4RunReportResponse {
  return {
    dimensionHeaders: request.dimensions.map(({ name }) => ({ name })),
    metricHeaders: request.metrics.map(({ name }) => ({ name })),
    rows: rows.map(([eventName, keyEvents, users]) => ({
      dimensionValues: [{ value: eventName }],
      metricValues: [{ value: keyEvents }, { value: users }],
    })),
    rowCount: rows.length,
    ...input,
  };
}

describe("GA4 dashboard conversion events", () => {
  beforeEach(() => {
    mocks.getByProjectId.mockResolvedValue(makeGa4Connection());
    mocks.batchRunReports.mockImplementation(async (requests) => ({
      reports: await Promise.all(
        requests.map((request) => mocks.runReport(request)),
      ),
    }));
    mocks.runReport.mockImplementation(async (request) =>
      request.dimensions[0]?.name === "eventName"
        ? responseFor(request)
        : {
            dimensionHeaders: request.dimensions.map(({ name }) => ({ name })),
            metricHeaders: request.metrics.map(({ name }) => ({ name })),
            rowCount: 0,
          },
    );
  });

  it("uses the fifth batch slot for current all-traffic key events", async () => {
    const result = await Ga4DashboardSummaryService.getDashboardGa4Summary(
      { projectId: "project_1" },
      { now: new Date("2026-08-06T15:00:00Z") },
    );

    const requests = mocks.batchRunReports.mock.calls[0]?.[0];
    expect(requests).toHaveLength(5);
    expect(result.period).toEqual({
      startDate: "2026-07-09",
      endDate: "2026-08-05",
      previousStartDate: "2026-06-11",
      previousEndDate: "2026-07-08",
    });
    expect(requests?.[4]).toMatchObject({
      dateRanges: [{ startDate: "2026-07-09", endDate: "2026-08-05" }],
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "keyEvents" }, { name: "totalUsers" }],
      limit: "1000",
      orderBys: [{ metric: { metricName: "keyEvents" }, desc: true }],
      metricFilter: {
        filter: {
          fieldName: "keyEvents",
          numericFilter: {
            operation: "GREATER_THAN",
            value: { doubleValue: 0 },
          },
        },
      },
    });
    for (const request of requests ?? []) {
      expect(request.dimensionFilter).toBeUndefined();
    }
  });

  it("returns the top five named event types and the complete active count", async () => {
    mocks.runReport.mockImplementation(async (request) => {
      if (request.dimensions[0]?.name !== "eventName") {
        return {
          dimensionHeaders: request.dimensions.map(({ name }) => ({ name })),
          metricHeaders: request.metrics.map(({ name }) => ({ name })),
          rowCount: 0,
        };
      }
      return responseFor(request, [
        ["", "100", "10"],
        ["(not set)", "90", "9"],
        ["form_submit", "80", "8"],
        ["phone_click_sales", "70", "7"],
        ["phone_click_support", "60", "6"],
        ["purchase", "50", "5"],
        ["book_demo", "40", "4"],
        ["email_click", "30", "3"],
      ]);
    });

    const result = await Ga4DashboardSummaryService.getDashboardGa4Summary({
      projectId: "project_1",
    });

    expect(result.conversionEvents).toEqual([
      { eventName: "form_submit", keyEvents: 80, users: 8 },
      { eventName: "phone_click_sales", keyEvents: 70, users: 7 },
      { eventName: "phone_click_support", keyEvents: 60, users: 6 },
      { eventName: "purchase", keyEvents: 50, users: 5 },
      { eventName: "book_demo", keyEvents: 40, users: 4 },
    ]);
    expect(result.conversionEventTypeCount).toBe(6);
  });

  it("preserves conversion report limitations and quota context", async () => {
    mocks.runReport.mockImplementation(async (request) => {
      if (request.dimensions[0]?.name !== "eventName") {
        return {
          dimensionHeaders: request.dimensions.map(({ name }) => ({ name })),
          metricHeaders: request.metrics.map(({ name }) => ({ name })),
          rowCount: 0,
        };
      }
      return responseFor(request, [["form_submit_contact", "5", "3"]], {
        metadata: { subjectToThresholding: true },
        propertyQuota: {
          tokensPerProjectPerHour: { consumed: 5, remaining: 95 },
        },
      });
    });

    const result = await Ga4DashboardSummaryService.getDashboardGa4Summary({
      projectId: "project_1",
    });

    expect(result.limitedData.conversions).toBe(true);
    expect(result.quota.conversions).toMatchObject({
      reportMetadata: { hasLimitedData: true, subjectToThresholding: true },
      quota: {
        tokensPerProjectPerHour: { consumed: 5, remaining: 95 },
      },
    });
  });
});
