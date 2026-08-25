import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeGa4Connection } from "./ga4-test-fixtures";
import { Ga4OrganicOverviewService } from "./Ga4OrganicOverviewService";

const mocks = vi.hoisted(() => ({
  getByProjectId: vi.fn(),
  runReport: vi.fn(),
}));

vi.mock("@/server/features/ga4/repositories/Ga4ConnectionRepository", () => ({
  Ga4ConnectionRepository: { getByProjectId: mocks.getByProjectId },
}));

vi.mock("@/server/lib/ga4Client", () => ({
  createGa4DataClient: () => ({ runReport: mocks.runReport }),
}));

const connection = makeGa4Connection();

const metricHeaders = [
  "sessions",
  "activeUsers",
  "engagedSessions",
  "engagementRate",
  "keyEvents",
  "transactions",
  "purchaseRevenue",
].map((name) => ({ name }));

function metricValues(values: string[]) {
  return values.map((value) => ({ value }));
}

describe("Ga4OrganicOverviewService", () => {
  beforeEach(() => {
    mocks.getByProjectId.mockResolvedValue(connection);
  });

  it("returns an equal-length comparison and weekly trend", async () => {
    mocks.runReport
      .mockResolvedValueOnce({
        dimensionHeaders: [],
        metricHeaders,
        rows: [
          {
            dimensionValues: [],
            metricValues: metricValues([
              "100",
              "80",
              "70",
              "0.7",
              "10",
              "4",
              "500",
            ]),
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        dimensionHeaders: [],
        metricHeaders,
        rows: [
          {
            dimensionValues: [],
            metricValues: metricValues([
              "80",
              "70",
              "50",
              "0.625",
              "5",
              "2",
              "250",
            ]),
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        dimensionHeaders: [{ name: "yearWeek" }],
        metricHeaders,
        rows: [
          {
            dimensionValues: [{ value: "202631" }],
            metricValues: metricValues([
              "100",
              "80",
              "70",
              "0.7",
              "10",
              "4",
              "500",
            ]),
          },
        ],
        rowCount: 1,
      });
    const result = await Ga4OrganicOverviewService.getOrganicOverview(
      {
        projectId: "project_1",
        startDate: "2026-07-09",
        endDate: "2026-08-05",
        trend: "weekly",
      },
      { now: new Date("2026-08-06T15:00:00Z") },
    );

    expect(result.request.previousDateRange).toEqual({
      startDate: "2026-06-11",
      endDate: "2026-07-08",
    });
    expect(result.comparison.sessions).toEqual({
      current: 100,
      previous: 80,
      absoluteChange: 20,
      percentChange: 0.25,
    });
    expect(result.trend[0]).toMatchObject({
      yearWeek: "202631",
      sessions: 100,
    });
    expect(result.diagnostics).toEqual([]);
    expect(mocks.runReport).toHaveBeenCalledTimes(3);
  });

  it("treats a headerless previous-period response as empty instead of malformed", async () => {
    mocks.runReport
      .mockResolvedValueOnce({
        dimensionHeaders: [],
        metricHeaders,
        rows: [
          {
            dimensionValues: [],
            metricValues: metricValues([
              "100",
              "80",
              "70",
              "0.7",
              "10",
              "4",
              "500",
            ]),
          },
        ],
        rowCount: 1,
      })
      // GA4 omits headers and rows entirely when the previous-period window
      // falls before the property's creation date.
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        dimensionHeaders: [{ name: "date" }],
        metricHeaders,
        rows: [],
        rowCount: 0,
      });
    const result = await Ga4OrganicOverviewService.getOrganicOverview(
      { projectId: "project_1", trend: "daily" },
      { now: new Date("2026-08-06T15:00:00Z") },
    );
    expect(result.previous).toBeNull();
    expect(result.comparison.sessions).toEqual({
      current: 100,
      previous: null,
      absoluteChange: null,
      percentChange: null,
    });
    expect(result.diagnostics).toEqual([]);
  });

  it("flags a material key-event decline with explicit evidence", async () => {
    const report = (keyEvents: string) => ({
      dimensionHeaders: [],
      metricHeaders,
      rows: [
        {
          dimensionValues: [],
          metricValues: metricValues([
            "100",
            "80",
            "70",
            "0.7",
            keyEvents,
            "0",
            "0",
          ]),
        },
      ],
      rowCount: 1,
    });
    mocks.runReport
      .mockResolvedValueOnce(report("3"))
      .mockResolvedValueOnce(report("10"))
      .mockResolvedValueOnce({
        dimensionHeaders: [{ name: "date" }],
        metricHeaders,
        rowCount: 0,
      });
    const result = await Ga4OrganicOverviewService.getOrganicOverview(
      { projectId: "project_1", trend: "daily" },
      { now: new Date("2026-08-06T15:00:00Z") },
    );
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("key_events_sharp_decline");
    expect(result.diagnostics[0]?.evidence).toEqual({
      current: 3,
      previous: 10,
      percentChange: -0.7,
    });
    expect(result.diagnostics[0]?.threshold).toEqual({
      minimumPreviousKeyEvents: 5,
      percentChange: -0.5,
    });
  });
});
