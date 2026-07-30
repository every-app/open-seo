import { describe, expect, it } from "vitest";
import {
  buildSearchAnalyticsRequest,
  resolveDateRange,
} from "@/server/features/gsc/searchAnalytics";

const TODAY = new Date("2026-05-28T00:00:00Z");

/** GSC counts startDate and endDate inclusively, so the window a range asks
 *  for must match the days GSC will actually bill it for. */
function inclusiveDays(startDate: string, endDate: string): number {
  const dayMs = 24 * 60 * 60 * 1000;
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  return (end - start) / dayMs + 1;
}

describe("resolveDateRange", () => {
  it("ends convenience ranges 3 days back for GSC data lag", () => {
    const { endDate } = resolveDateRange({ dateRange: "last_28_days" }, TODAY);
    expect(endDate).toBe("2026-05-25");
  });

  it("spans 28 inclusive days from the lagged end", () => {
    const { startDate, endDate } = resolveDateRange(
      { dateRange: "last_28_days" },
      TODAY,
    );
    expect(startDate).toBe("2026-04-28");
    expect(endDate).toBe("2026-05-25");
    expect(inclusiveDays(startDate, endDate)).toBe(28);
  });

  it("spans 7 inclusive days from the lagged end", () => {
    const { startDate, endDate } = resolveDateRange(
      { dateRange: "last_7_days" },
      TODAY,
    );
    expect(startDate).toBe("2026-05-19");
    expect(endDate).toBe("2026-05-25");
    expect(inclusiveDays(startDate, endDate)).toBe(7);
  });

  it("clamps the start to the 16-month floor", () => {
    const { startDate } = resolveDateRange(
      { dateRange: "last_16_months" },
      TODAY,
    );
    // end (2026-05-25) - 16 months = 2025-01-25, but floor is today - 16 months.
    expect(startDate).toBe("2025-01-28");
  });

  it("passes explicit dates through, clamping start to the floor", () => {
    const { startDate, endDate } = resolveDateRange(
      { startDate: "2020-01-01", endDate: "2026-05-01" },
      TODAY,
    );
    expect(startDate).toBe("2025-01-28"); // clamped
    expect(endDate).toBe("2026-05-01");
  });

  it("leaves an in-range explicit start untouched", () => {
    const { startDate } = resolveDateRange(
      { startDate: "2026-01-01", endDate: "2026-05-01" },
      TODAY,
    );
    expect(startDate).toBe("2026-01-01");
  });

  it("subtracts calendar months without overflowing short months", () => {
    const { startDate, endDate } = resolveDateRange(
      { dateRange: "last_3_months" },
      new Date("2026-06-03T00:00:00Z"),
    );
    // Feb 28 is the clamped subtraction; the window starts the day after it so
    // Mar 1 - May 31 covers three whole months rather than three months plus a day.
    expect(startDate).toBe("2026-03-01");
    expect(endDate).toBe("2026-05-31");
  });

  it("clamps the 16-month floor to the last valid day of a short month", () => {
    const { startDate } = resolveDateRange(
      { dateRange: "last_16_months" },
      new Date("2026-06-30T00:00:00Z"),
    );
    expect(startDate).toBe("2025-02-28");
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

  it("omits dimensionFilterGroups when no filters are given", () => {
    const request = buildSearchAnalyticsRequest({ projectId: "p1" }, TODAY);
    expect(request.dimensionFilterGroups).toBeUndefined();
  });

  it("defaults dimensions, type, dataState, and rowLimit", () => {
    const request = buildSearchAnalyticsRequest({ projectId: "p1" }, TODAY);
    expect(request.dimensions).toEqual(["query"]);
    expect(request.type).toBe("web");
    expect(request.dataState).toBe("all");
    expect(request.rowLimit).toBe(1000);
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

  it("only includes startRow when positive", () => {
    expect(
      buildSearchAnalyticsRequest({ projectId: "p1" }, TODAY).startRow,
    ).toBeUndefined();
    expect(
      buildSearchAnalyticsRequest({ projectId: "p1", startRow: 1000 }, TODAY)
        .startRow,
    ).toBe(1000);
  });
});
