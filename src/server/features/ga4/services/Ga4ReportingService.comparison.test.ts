import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Ga4RunReportRequest,
  Ga4RunReportResponse,
} from "@/server/lib/ga4Client";
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

function noComparison() {
  return {
    current: null,
    previous: null,
    absoluteChange: null,
    percentChange: null,
  };
}

describe("Ga4ReportingService previous-period comparison", () => {
  beforeEach(() => {
    mocks.getByProjectId.mockResolvedValue(connection);
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
          activeUsers: { ...noComparison(), current: 10 },
          sessions: { ...noComparison(), current: 12 },
          engagementRate: { ...noComparison(), current: 0.5 },
          keyEvents: { ...noComparison(), current: 2 },
        },
      },
    ]);
    expect(result.comparison?.coverage.previous).toEqual({
      fetchedRowCount: 0,
      totalRowCount: 0,
    });
  });
});
