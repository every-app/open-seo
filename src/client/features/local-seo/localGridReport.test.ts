import { describe, expect, it } from "vitest";
import type { LocalGridResultCell } from "@/types/schemas/local-seo";
import {
  buildLocalGridReportMetrics,
  formatGridRadius,
  reportPriority,
} from "./localGridReport";

function cell(
  targetRank: number | null,
  status: LocalGridResultCell["status"] = "completed",
): LocalGridResultCell {
  return {
    resultId: crypto.randomUUID(),
    pointId: crypto.randomUUID(),
    trackingKeywordId: "keyword-1",
    keyword: "roofer worthing",
    rowIndex: 0,
    columnIndex: 0,
    latitude: 50.82,
    longitude: -0.37,
    status,
    targetRank,
    matchedBy: targetRank === null ? "none" : "place_id",
    errorMessage: status === "failed" ? "Provider failure" : null,
  };
}

describe("local grid report", () => {
  it("separates visibility, opportunity, unranked and failures", () => {
    const metrics = buildLocalGridReportMetrics([
      cell(1),
      cell(3),
      cell(8),
      cell(15),
      cell(null),
      cell(null, "failed"),
    ]);

    expect(metrics).toMatchObject({
      completed: 5,
      failed: 1,
      visible: 4,
      topThree: 2,
      topTen: 3,
      opportunity: 1,
      unranked: 1,
      visibilityPercent: 80,
      topThreePercent: 40,
      opportunityPercent: 20,
      unrankedPercent: 20,
      averageVisibleRank: 6.75,
    });
    expect(reportPriority(metrics)).toContain("Re-run");
  });

  it("formats configured coverage in the selected distance unit", () => {
    expect(
      formatGridRadius({
        businessName: "Royal Roofing Services",
        address: "Worthing, West Sussex",
        centerLatitude: 50.82,
        centerLongitude: -0.37,
        gridSize: 7,
        radiusMeters: 4_828.032,
        distanceUnit: "mi",
        rating: 4.9,
        reviewCount: 38,
      }),
    ).toBe("7 x 7 (3 mi radius)");
  });
});
