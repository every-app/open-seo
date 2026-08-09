import { describe, expect, it } from "vitest";
import {
  buildRunReportRequest,
  resolveDateRange,
} from "@/server/features/ga4/analyticsReport";

const TODAY = new Date("2026-05-28T00:00:00Z");

describe("resolveDateRange", () => {
  it("ends convenience ranges 1 day back for GA4's processing lag", () => {
    const { endDate } = resolveDateRange({ dateRange: "last_28_days" }, TODAY);
    expect(endDate).toBe("2026-05-27");
  });

  it("computes a 28-day window from the lagged end", () => {
    const { startDate, endDate } = resolveDateRange(
      { dateRange: "last_28_days" },
      TODAY,
    );
    expect(startDate).toBe("2026-04-29");
    expect(endDate).toBe("2026-05-27");
  });

  it("does not clamp a far-in-the-past explicit start — unlike Search Console, GA4 has no fixed lookback ceiling", () => {
    const { startDate, endDate } = resolveDateRange(
      { startDate: "2020-01-01", endDate: "2026-05-01" },
      TODAY,
    );
    expect(startDate).toBe("2020-01-01");
    expect(endDate).toBe("2026-05-01");
  });

  it("passes explicit dates through untouched", () => {
    const { startDate, endDate } = resolveDateRange(
      { startDate: "2026-01-01", endDate: "2026-05-01" },
      TODAY,
    );
    expect(startDate).toBe("2026-01-01");
    expect(endDate).toBe("2026-05-01");
  });
});

describe("buildRunReportRequest", () => {
  it("defaults dimensions to ['date'] and wraps metrics/dateRanges", () => {
    const request = buildRunReportRequest(
      { projectId: "p1", metrics: ["sessions"] },
      TODAY,
    );
    expect(request.dimensions).toEqual([{ name: "date" }]);
    expect(request.metrics).toEqual([{ name: "sessions" }]);
    expect(request.dateRanges).toEqual([
      { startDate: "2026-04-29", endDate: "2026-05-27" },
    ]);
  });

  it("maps requested dimensions and metrics in order", () => {
    const request = buildRunReportRequest(
      {
        projectId: "p1",
        dimensions: ["sessionDefaultChannelGroup", "pagePath"],
        metrics: ["sessions", "totalUsers"],
      },
      TODAY,
    );
    expect(request.dimensions).toEqual([
      { name: "sessionDefaultChannelGroup" },
      { name: "pagePath" },
    ]);
    expect(request.metrics).toEqual([
      { name: "sessions" },
      { name: "totalUsers" },
    ]);
  });

  it("clamps limit to the 1000 ceiling", () => {
    expect(
      buildRunReportRequest(
        { projectId: "p1", metrics: ["sessions"], rowLimit: 99999 },
        TODAY,
      ).limit,
    ).toBe(1000);
    expect(
      buildRunReportRequest(
        { projectId: "p1", metrics: ["sessions"], rowLimit: 0 },
        TODAY,
      ).limit,
    ).toBe(1);
  });

  it("only includes offset when startRow is positive", () => {
    expect(
      buildRunReportRequest({ projectId: "p1", metrics: ["sessions"] }, TODAY)
        .offset,
    ).toBeUndefined();
    expect(
      buildRunReportRequest(
        { projectId: "p1", metrics: ["sessions"], startRow: 500 },
        TODAY,
      ).offset,
    ).toBe(500);
  });

  it("omits dimensionFilter when no filters are given", () => {
    const request = buildRunReportRequest(
      { projectId: "p1", metrics: ["sessions"] },
      TODAY,
    );
    expect(request.dimensionFilter).toBeUndefined();
  });

  it("builds a single string filter directly, without a group wrapper", () => {
    const request = buildRunReportRequest(
      {
        projectId: "p1",
        metrics: ["sessions"],
        filters: [
          {
            dimension: "sessionDefaultChannelGroup",
            operator: "equals",
            expression: "Organic Search",
          },
        ],
      },
      TODAY,
    );
    expect(request.dimensionFilter).toEqual({
      filter: {
        fieldName: "sessionDefaultChannelGroup",
        stringFilter: {
          matchType: "EXACT",
          value: "Organic Search",
          caseSensitive: false,
        },
      },
    });
  });

  it("wraps a negated operator in notExpression", () => {
    const request = buildRunReportRequest(
      {
        projectId: "p1",
        metrics: ["sessions"],
        filters: [
          {
            dimension: "country",
            operator: "notEquals",
            expression: "Spain",
          },
        ],
      },
      TODAY,
    );
    expect(request.dimensionFilter).toEqual({
      notExpression: {
        filter: {
          fieldName: "country",
          stringFilter: {
            matchType: "EXACT",
            value: "Spain",
            caseSensitive: false,
          },
        },
      },
    });
  });

  it("uses CONTAINS matchType for contains/notContains operators", () => {
    const request = buildRunReportRequest(
      {
        projectId: "p1",
        metrics: ["sessions"],
        filters: [
          { dimension: "pagePath", operator: "contains", expression: "/blog/" },
        ],
      },
      TODAY,
    );
    expect(request.dimensionFilter).toEqual({
      filter: {
        fieldName: "pagePath",
        stringFilter: {
          matchType: "CONTAINS",
          value: "/blog/",
          caseSensitive: false,
        },
      },
    });
  });

  it("AND-combines more than one filter into andGroup", () => {
    const request = buildRunReportRequest(
      {
        projectId: "p1",
        metrics: ["sessions"],
        filters: [
          {
            dimension: "sessionDefaultChannelGroup",
            operator: "equals",
            expression: "Organic Search",
          },
          { dimension: "deviceCategory", operator: "equals", expression: "mobile" },
        ],
      },
      TODAY,
    );
    expect(request.dimensionFilter).toEqual({
      andGroup: {
        expressions: [
          {
            filter: {
              fieldName: "sessionDefaultChannelGroup",
              stringFilter: {
                matchType: "EXACT",
                value: "Organic Search",
                caseSensitive: false,
              },
            },
          },
          {
            filter: {
              fieldName: "deviceCategory",
              stringFilter: {
                matchType: "EXACT",
                value: "mobile",
                caseSensitive: false,
              },
            },
          },
        ],
      },
    });
  });
});
