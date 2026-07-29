import { describe, expect, it } from "vitest";
import type {
  PagespeedSnapshotLike,
  SnapshotWithPrevious,
} from "@/shared/pagespeed";
import { buildPagespeedExportTable } from "./export";

function snapshot(
  overrides: Partial<PagespeedSnapshotLike> & { id: string; urlId: string },
): PagespeedSnapshotLike {
  return {
    strategy: "mobile",
    createdAt: "2026-07-30T10:00:00.000Z",
    performanceScore: null,
    accessibilityScore: null,
    bestPracticesScore: null,
    seoScore: null,
    lcpMs: null,
    cls: null,
    tbtMs: null,
    fcpMs: null,
    speedIndexMs: null,
    ttfbMs: null,
    fieldLcpMs: null,
    fieldInpMs: null,
    fieldCls: null,
    fieldOverallCategory: null,
    fieldSource: null,
    fetchTime: null,
    errorMessage: null,
    ...overrides,
  };
}

const urls = [
  { id: "u1", url: "https://a.com/", isHomepage: true },
  { id: "u2", url: "https://a.com/pricing", isHomepage: false },
];

function latestOf(
  entries: Record<string, PagespeedSnapshotLike>,
): Map<string, SnapshotWithPrevious> {
  return new Map(
    Object.entries(entries).map(([urlId, snap]) => [
      urlId,
      { snapshot: snap, previous: null },
    ]),
  );
}

describe("buildPagespeedExportTable", () => {
  it("exports raw numbers, not the page's formatted strings", () => {
    const latest = latestOf({
      u1: snapshot({
        id: "s1",
        urlId: "u1",
        performanceScore: 95,
        lcpMs: 2400.5,
        cls: 0.05,
        fieldLcpMs: 2100,
        fieldCls: 0.02,
        fieldOverallCategory: "AVERAGE",
        fieldSource: "url",
      }),
    });

    const { headers, rows } = buildPagespeedExportTable(urls, latest, "mobile");

    expect(headers[0]).toBe("URL");
    const row = rows[0] ?? [];
    expect(row[0]).toBe("https://a.com/");
    expect(row[1]).toBe("yes");
    expect(row[2]).toBe("mobile");
    expect(row[3]).toBe(95);
    // Milliseconds stay numeric — no "2.4 s".
    expect(row[7]).toBe(2400.5);
    expect(row[8]).toBe(0.05);
  });

  it("keeps a row for a URL that has never run", () => {
    const { rows } = buildPagespeedExportTable(urls, new Map(), "mobile");

    expect(rows).toHaveLength(2);
    expect(rows[1]?.[0]).toBe("https://a.com/pricing");
    // Every metric blank rather than zero — never-run is not a score of 0.
    expect(rows[1]?.slice(3)).toEqual(Array.from({ length: 17 }, () => null));
  });

  it("records the field source so origin data is never read as page data", () => {
    const latest = latestOf({
      u2: snapshot({
        id: "s2",
        urlId: "u2",
        fieldLcpMs: 4200,
        fieldOverallCategory: "SLOW",
        fieldSource: "origin",
      }),
    });

    const { headers, rows } = buildPagespeedExportTable(urls, latest, "mobile");

    const sourceIndex = headers.indexOf("Field source");
    expect(rows[1]?.[sourceIndex]).toBe("origin");
  });

  it("carries the error message for a failed run", () => {
    const latest = latestOf({
      u1: snapshot({
        id: "s3",
        urlId: "u1",
        errorMessage: "PageSpeed Insights daily quota reached.",
      }),
    });

    const { headers, rows } = buildPagespeedExportTable(urls, latest, "mobile");

    expect(rows[0]?.[headers.indexOf("Error")]).toBe(
      "PageSpeed Insights daily quota reached.",
    );
  });

  it("has one value per header", () => {
    const { headers, rows } = buildPagespeedExportTable(
      urls,
      new Map(),
      "desktop",
    );
    for (const row of rows) {
      expect(row).toHaveLength(headers.length);
    }
  });
});
