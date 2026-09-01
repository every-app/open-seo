import { readFileSync } from "node:fs";
import { jsPDF } from "jspdf";
import { describe, expect, it } from "vitest";
import type { LocalGridResultCell } from "@/types/schemas/local-seo";
import { renderLocalGridPdf } from "./localGridPdf";

const cell: LocalGridResultCell = {
  resultId: "result-1",
  pointId: "point-1",
  trackingKeywordId: "keyword-1",
  keyword: "roofers worthing",
  rowIndex: 0,
  columnIndex: 0,
  latitude: 50.82,
  longitude: -0.37,
  status: "completed",
  targetRank: 2,
  matchedBy: "place_id",
  errorMessage: null,
};

describe("local grid PDF", () => {
  it("renders a one-page report with the captured map image", () => {
    const mapData = readFileSync("public/optimisr-report-logo.png").toString(
      "base64",
    );
    const doc = renderLocalGridPdf(
      new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" }),
      {
        context: {
          businessName: "Royal Roofing Services",
          address: "Worthing, West Sussex",
          centerLatitude: 50.82,
          centerLongitude: -0.37,
          gridSize: 7,
          radiusMeters: 4_828,
          distanceUnit: "mi",
          rating: 4.9,
          reviewCount: 38,
        },
        keyword: "roofers worthing",
        scannedAt: "2026-09-01T03:42:05.000Z",
        cells: [cell],
        competitors: [],
        mapImage: {
          dataUrl: `data:image/png;base64,${mapData}`,
          format: "PNG",
          width: 1_000,
          height: 350,
        },
      },
      null,
    );

    expect(doc.getNumberOfPages()).toBe(1);
    expect(doc.output("arraybuffer").byteLength).toBeGreaterThan(10_000);
  });
});
