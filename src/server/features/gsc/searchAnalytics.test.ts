import { describe, expect, it } from "vitest";
import {
  buildSearchAnalyticsRequest,
  resolveDateRange,
} from "@/server/features/gsc/searchAnalytics";

const TODAY = new Date("2026-05-28T00:00:00Z");

describe("resolveDateRange", () => {
  it("computes a 28-day window from the lagged end", () => {
    const { startDate, endDate } = resolveDateRange(
      { dateRange: "last_28_days" },
      TODAY,
    );
    expect(startDate).toBe("2026-04-27");
    expect(endDate).toBe("2026-05-25");
  });

  it("clamps the start to the 16-month floor", () => {
    const { startDate } = resolveDateRange(
      { dateRange: "last_16_months" },
      TODAY,
    );
    // end (2026-05-25) - 16 months = 2025-01-25, but floor is today - 16 months.
    expect(startDate).toBe("2025-01-28");
  });

  it("passes explicit dates through, clamping only a start below the floor", () => {
    expect(
      resolveDateRange(
        { startDate: "2020-01-01", endDate: "2026-05-01" },
        TODAY,
      ),
    ).toEqual({ startDate: "2025-01-28", endDate: "2026-05-01" });
    expect(
      resolveDateRange(
        { startDate: "2026-01-01", endDate: "2026-05-01" },
        TODAY,
      ).startDate,
    ).toBe("2026-01-01");
  });

  it.each([
    {
      dateRange: "last_3_months" as const,
      today: "2026-06-03",
      startDate: "2026-02-28",
      endDate: "2026-05-31",
    },
    {
      dateRange: "last_16_months" as const,
      today: "2026-06-30",
      startDate: "2025-02-28",
      endDate: "2026-06-27",
    },
  ])(
    "subtracts calendar months without overflowing short months ($dateRange from $today)",
    ({ dateRange, today, startDate, endDate }) => {
      expect(
        resolveDateRange({ dateRange }, new Date(`${today}T00:00:00Z`)),
      ).toEqual({ startDate, endDate });
    },
  );
});

describe("buildSearchAnalyticsRequest", () => {
  it("wraps flat filters into a single AND dimensionFilterGroup", () => {
    const request = buildSearchAnalyticsRequest(
      {
        projectId: "p1",
        dimensions: ["query"],
        filters: [
          {
            dimension: "page",
            operator: "equals",
            expression: "https://example.com/post",
          },
        ],
      },
      TODAY,
    );
    // The whole point: GSC ignores a top-level `filters` field.
    expect(request).not.toHaveProperty("filters");
    expect(request.dimensionFilterGroups).toEqual([
      {
        groupType: "and",
        filters: [
          {
            dimension: "page",
            operator: "equals",
            expression: "https://example.com/post",
          },
        ],
      },
    ]);
  });

  it("clamps rowLimit to the 1000 ceiling", () => {
    expect(
      buildSearchAnalyticsRequest({ projectId: "p1", rowLimit: 99999 }, TODAY)
        .rowLimit,
    ).toBe(1000);
    expect(
      buildSearchAnalyticsRequest({ projectId: "p1", rowLimit: 0 }, TODAY)
        .rowLimit,
    ).toBe(1);
  });
});
