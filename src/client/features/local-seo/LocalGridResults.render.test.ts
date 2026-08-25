import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
  LocalGridResultCell,
  LocalGridResultsResponse,
} from "@/types/schemas/local-seo";
import { LocalGridResults } from "./LocalGridResults";

function resultCell(
  resultId: string,
  columnIndex: number,
  targetRank: number | null,
): LocalGridResultCell {
  return {
    resultId,
    pointId: `point-${resultId}`,
    trackingKeywordId: "keyword-1",
    keyword: "loft conversions",
    rowIndex: 0,
    columnIndex,
    latitude: 50.81,
    longitude: -0.37 + columnIndex * 0.01,
    status: "completed",
    targetRank,
    matchedBy: targetRank === null ? "none" : "place_id",
    errorMessage: null,
  };
}

describe("LocalGridResults", () => {
  it("renders an accessible spatial grid and summary", () => {
    const data: LocalGridResultsResponse = {
      gridSize: 3,
      run: {
        id: "run-1",
        status: "completed",
        taskCount: 3,
        tasksCompleted: 3,
        providerCostUsd: 0.0018,
        errorMessage: null,
        startedAt: "2026-08-25T00:00:00.000Z",
        completedAt: "2026-08-25T00:10:00.000Z",
      },
      keywords: [{ id: "keyword-1", keyword: "loft conversions" }],
      cells: [
        resultCell("result-1", 0, 1),
        resultCell("result-2", 1, 5),
        resultCell("result-3", 2, null),
      ],
    };

    const markup = renderToStaticMarkup(
      createElement(LocalGridResults, { data }),
    );

    expect(markup).toContain('aria-label="Local ranking map grid"');
    expect(markup).toContain('aria-label="Grid keyword"');
    expect(markup).toContain("Visibility");
    expect(markup).toContain("67%");
    expect(markup).toContain("Row 1, column 1: 1");
    expect(markup).toContain("Row 1, column 3: Not found");
  });
});
