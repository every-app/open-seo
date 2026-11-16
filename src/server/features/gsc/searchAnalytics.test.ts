import { describe, expect, it } from "vitest";
import {
  buildSearchAnalyticsRequest,
  resolveDateRange,
} from "@/server/features/gsc/searchAnalytics";

// Noon UTC (05:00 PDT) falls on the same calendar day in Pacific time.
const TODAY = new Date("2026-05-28T12:00:00Z");

describe("resolveDateRange", () => {
  it.each([
    { dateRange: "last_7_days" as const, startDate: "2026-05-19" },
    { dateRange: "last_28_days" as const, startDate: "2026-04-28" },
  ])(
    "computes an inclusive $dateRange window from the lagged end",
    ({ dateRange, startDate }) => {
      expect(resolveDateRange({ dateRange }, TODAY)).toEqual({
        startDate,
        endDate: "2026-05-25",
      });
    },
  );

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
        resolveDateRange({ dateRange }, new Date(`${today}T12:00:00Z`)),
      ).toEqual({ startDate, endDate });
    },
  );

  it("keeps presets stable across UTC midnight and rolls over at Pacific midnight", () => {
    // 23:59Z (3:59 PM PST) and 00:01Z (4:01 PM PST) are both Nov 15 in Pacific time.
    expect(
      resolveDateRange(
        { dateRange: "last_7_days" },
        new Date("2026-11-15T23:59:00Z"),
      ),
    ).toEqual({ startDate: "2026-11-06", endDate: "2026-11-12" });

    expect(
      resolveDateRange(
        { dateRange: "last_7_days" },
        new Date("2026-11-16T00:01:00Z"),
      ),
    ).toEqual({ startDate: "2026-11-06", endDate: "2026-11-12" });

    // Advances once Pacific midnight arrives (08:00Z during PST = UTC-8).
    expect(
      resolveDateRange(
        { dateRange: "last_7_days" },
        new Date("2026-11-16T08:00:00Z"),
      ),
    ).toEqual({ startDate: "2026-11-07", endDate: "2026-11-13" });

    // Advances at Pacific midnight during PDT (07:00Z during PDT = UTC-7).
    expect(
      resolveDateRange(
        { dateRange: "last_7_days" },
        new Date("2026-07-16T06:59:00Z"),
      ),
    ).toEqual({ startDate: "2026-07-06", endDate: "2026-07-12" });

    expect(
      resolveDateRange(
        { dateRange: "last_7_days" },
        new Date("2026-07-16T07:00:00Z"),
      ),
    ).toEqual({ startDate: "2026-07-07", endDate: "2026-07-13" });
  });
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