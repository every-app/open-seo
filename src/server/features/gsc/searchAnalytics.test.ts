import { describe, expect, it } from "vitest";
import {
  buildSearchAnalyticsRequest,
  resolveDateRange,
} from "@/server/features/gsc/searchAnalytics";

const TODAY = new Date("2026-05-28T00:00:00Z");

describe("resolveDateRange", () => {
  it("ends convenience ranges 3 days back for GSC data lag", () => {
    const { endDate } = resolveDateRange({ dateRange: "last_28_days" }, TODAY);
    expect(endDate).toBe("2026-05-25");
  });

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
