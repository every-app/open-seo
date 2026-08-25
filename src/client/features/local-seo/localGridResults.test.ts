import { describe, expect, it } from "vitest";
import type { LocalGridResultCell } from "@/types/schemas/local-seo";
import {
  localGridCellClass,
  localGridCellLabel,
  summarizeLocalGridCells,
} from "./localGridResultUtils";

function cell(
  targetRank: number | null,
  status: LocalGridResultCell["status"] = "completed",
): LocalGridResultCell {
  return {
    resultId: crypto.randomUUID(),
    pointId: crypto.randomUUID(),
    trackingKeywordId: "keyword-1",
    keyword: "loft conversions",
    rowIndex: 0,
    columnIndex: 0,
    latitude: 50.8,
    longitude: -0.3,
    status,
    targetRank,
    matchedBy: targetRank === null ? "none" : "place_id",
    errorMessage: status === "failed" ? "Provider failure" : null,
  };
}

describe("local grid result presentation", () => {
  it("summarizes only completed cells", () => {
    expect(
      summarizeLocalGridCells([
        cell(1),
        cell(5),
        cell(null),
        cell(null, "pending"),
      ]),
    ).toEqual({
      completed: 3,
      visible: 2,
      topThree: 1,
      visibilityPercent: 67,
      averageVisibleRank: 3,
    });
  });

  it("assigns stable labels and rank bands", () => {
    expect(localGridCellClass(cell(3))).toContain("bg-success");
    expect(localGridCellClass(cell(10))).toContain("bg-lime-500");
    expect(localGridCellClass(cell(20))).toContain("bg-warning");
    expect(localGridCellClass(cell(21))).toContain("bg-error");
    expect(localGridCellLabel(cell(null))).toBe("Not found");
    expect(localGridCellLabel(cell(null, "pending"))).toBe("Pending");
  });
});
