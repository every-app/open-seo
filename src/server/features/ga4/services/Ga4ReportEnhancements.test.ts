import { describe, expect, it } from "vitest";
import { buildGa4ReportRequest } from "./Ga4ReportDefinitions";
import {
  buildEcommerceActivity,
  buildReportComparison,
  buildReportSpecificEnhancements,
  buildSiteSearchActivity,
  previousPeriod,
  supportsComparison,
} from "./Ga4ReportEnhancements";
import type { NormalizedGa4Report } from "./Ga4ReportNormalization";

const metadata = {
  dataLossFromOtherRow: false,
  subjectToThresholding: false,
  sampling: [],
  restrictedMetrics: [],
  emptyReason: null,
  hasLimitedData: false,
};

function report(
  rows: NormalizedGa4Report["rows"],
  totalRowCount = rows.length,
): NormalizedGa4Report {
  return { rows, totalRowCount, reportMetadata: metadata, quota: null };
}

describe("GA4 report enhancements", () => {
  it("filters key events and optional transaction-only landing pages", () => {
    const keyEvents = buildGa4ReportRequest({
      kind: "key_events",
      startDate: "2026-07-09",
      endDate: "2026-08-05",
      channel: "organic_search",
      limit: 100,
      offset: 0,
    });
    const ecommerce = buildGa4ReportRequest({
      kind: "ecommerce_performance",
      ecommerceBreakdown: "landing_page",
      ecommerceOnlyWithTransactions: true,
      startDate: "2026-07-09",
      endDate: "2026-08-05",
      channel: "organic_search",
      limit: 100,
      offset: 0,
    });
    expect(keyEvents.metricFilter).toMatchObject({
      filter: {
        fieldName: "keyEvents",
        numericFilter: { operation: "GREATER_THAN" },
      },
    });
    expect(ecommerce.metricFilter).toMatchObject({
      filter: {
        fieldName: "transactions",
        numericFilter: { operation: "GREATER_THAN" },
      },
    });
  });

  it("compares an equal prior period using the union of row keys", () => {
    expect(
      previousPeriod({ startDate: "2026-07-09", endDate: "2026-08-05" }),
    ).toEqual({ startDate: "2026-06-11", endDate: "2026-07-08" });
    const comparison = buildReportComparison({
      current: report([{ eventName: "form_submit", keyEvents: 3 }]),
      previous: report([
        { eventName: "form_submit", keyEvents: 0 },
        { eventName: "book_demo", keyEvents: 2 },
      ]),
      previousDateRange: {
        startDate: "2026-06-11",
        endDate: "2026-07-08",
      },
      dimensions: ["eventName"],
      metrics: ["keyEvents"],
    });
    expect(comparison.coverage.complete).toBe(true);
    expect(comparison.rows).toEqual([
      {
        dimensions: { eventName: "form_submit" },
        metrics: {
          keyEvents: {
            current: 3,
            previous: 0,
            absoluteChange: 3,
            percentChange: null,
          },
        },
      },
      {
        dimensions: { eventName: "book_demo" },
        metrics: {
          keyEvents: {
            current: null,
            previous: 2,
            absoluteChange: null,
            percentChange: null,
          },
        },
      },
    ]);
  });

  it("limits comparisons to unambiguous low-cardinality breakdowns", () => {
    expect(
      supportsComparison({
        projectId: "project_1",
        kind: "traffic_acquisition",
        acquisitionBreakdown: "channel_group",
      }),
    ).toBe(true);
    expect(
      supportsComparison({
        projectId: "project_1",
        kind: "traffic_acquisition",
        acquisitionBreakdown: "source_medium",
      }),
    ).toBe(false);
    expect(
      supportsComparison({
        projectId: "project_1",
        kind: "audience_breakdown",
        audienceBreakdown: "country",
      }),
    ).toBe(false);
  });

  it("returns evidence-backed source attribution diagnostics", () => {
    const result = buildReportSpecificEnhancements(
      report([
        { sessionSourceMedium: "google / organic", sessions: 80 },
        { sessionSourceMedium: "(not set)", sessions: 10 },
        { sessionSourceMedium: "localhost:6443 / referral", sessions: 5 },
        { sessionSourceMedium: "::1 / referral", sessions: 1 },
        { sessionSourceMedium: "LinkedIn / Social", sessions: 3 },
        { sessionSourceMedium: "linkedin / social", sessions: 2 },
      ]),
      {
        projectId: "project_1",
        kind: "traffic_acquisition",
        acquisitionBreakdown: "source_medium",
      },
      { startDate: "2026-07-09", endDate: "2026-08-05" },
    );
    expect("diagnosticCoverage" in result).toBe(true);
    if (!("diagnosticCoverage" in result)) throw new Error("Missing coverage");
    expect(result.diagnosticCoverage).toMatchObject({ complete: true });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "attribution_not_set_share_high",
      "internal_referral_traffic_detected",
      "source_medium_case_variants_detected",
    ]);
  });

  it("suppresses diagnostics and marks activity unknown when coverage is incomplete", () => {
    const incomplete = report(
      [{ sessionSourceMedium: "localhost / referral", sessions: 5 }],
      2,
    );
    const diagnostics = buildReportSpecificEnhancements(
      incomplete,
      {
        projectId: "project_1",
        kind: "traffic_acquisition",
        acquisitionBreakdown: "source_medium",
      },
      { startDate: "2026-07-09", endDate: "2026-08-05" },
    );
    const ecommerce = buildEcommerceActivity(
      report([{ itemName: "Example", itemsViewed: 1 }], 2),
      {
        projectId: "project_1",
        kind: "ecommerce_performance",
        ecommerceBreakdown: "item",
      },
      { startDate: "2026-07-09", endDate: "2026-08-05" },
    );
    expect(diagnostics.diagnostics).toEqual([]);
    expect(ecommerce.status).toBe("unknown");
  });

  it("reports scoped ecommerce and site-search activity states", () => {
    const ecommerce = buildEcommerceActivity(
      report([]),
      {
        projectId: "project_1",
        kind: "ecommerce_performance",
        ecommerceBreakdown: "landing_page",
        channel: "organic_search",
      },
      { startDate: "2026-07-09", endDate: "2026-08-05" },
    );
    const search = buildSiteSearchActivity(
      report([{ searchTerm: "seo", eventCount: 4 }]),
      { startDate: "2026-07-09", endDate: "2026-08-05" },
    );
    expect(ecommerce).toMatchObject({
      status: "none",
      channel: "organic_search",
      breakdown: "landing_page",
      evidence: { transactions: 0, purchaseRevenue: 0 },
    });
    expect(search).toMatchObject({
      status: "detected",
      searchTermCount: 1,
      searchEventCount: 4,
    });
  });
});
