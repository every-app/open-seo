import { describe, expect, it } from "vitest";
import {
  filterDimensionRowsByMetrics,
  filterStrikingDistanceByMetrics,
  matchesMetricFilters,
  normalizePagePathFilter,
  paginateRows,
  toPagePathGscFilter,
} from "@/server/features/gsc/searchPerformanceFilters";

describe("normalizePagePathFilter", () => {
  it("strips a trailing wildcard", () => {
    expect(normalizePagePathFilter("/blogs/*")).toBe("/blogs/");
  });

  it("keeps full URL fragments", () => {
    expect(normalizePagePathFilter("https://example.com/tools")).toBe(
      "https://example.com/tools",
    );
  });

  it("returns undefined for blank input", () => {
    expect(normalizePagePathFilter("  ")).toBeUndefined();
  });
});

describe("toPagePathGscFilter", () => {
  it("maps to a GSC page contains filter", () => {
    expect(toPagePathGscFilter("/blogs/*")).toEqual({
      dimension: "page",
      operator: "contains",
      expression: "/blogs/",
    });
  });
});

describe("matchesMetricFilters", () => {
  const row = { clicks: 10, impressions: 100, position: 8 };

  it("excludes rows below the impressions minimum", () => {
    expect(matchesMetricFilters(row, { minImpressions: 101 })).toBe(false);
  });

  it("includes rows within position bounds", () => {
    expect(matchesMetricFilters(row, { minPosition: 4, maxPosition: 10 })).toBe(
      true,
    );
  });

  it("passes all rows when no bounds are set", () => {
    expect(matchesMetricFilters(row, {})).toBe(true);
  });
});

describe("filterDimensionRowsByMetrics", () => {
  it("filters dimension rows before pagination", () => {
    const rows = [
      {
        key: "a",
        clicks: 1,
        impressions: 50,
        ctr: 0.02,
        position: 5,
      },
      {
        key: "b",
        clicks: 2,
        impressions: 200,
        ctr: 0.01,
        position: 6,
      },
    ];

    expect(
      filterDimensionRowsByMetrics(rows, { minImpressions: 100 }).map(
        (row) => row.key,
      ),
    ).toEqual(["b"]);
  });
});

describe("paginateRows", () => {
  it("slices filtered rows before returning a page", () => {
    const rows = Array.from({ length: 30 }, (_, index) => index + 1);
    const page1 = paginateRows(rows, 1, 25);
    expect(page1.rows).toHaveLength(25);
    expect(page1.hasNextPage).toBe(true);

    const page2 = paginateRows(rows, 2, 25);
    expect(page2.rows).toEqual([26, 27, 28, 29, 30]);
    expect(page2.hasNextPage).toBe(false);
  });
});

describe("filterStrikingDistanceByMetrics", () => {
  it("filters striking-distance rows by metrics", () => {
    const rows = [
      {
        query: "kw",
        page: "https://x.com/a",
        clicks: 1,
        impressions: 20,
        position: 12,
      },
    ];

    expect(
      filterStrikingDistanceByMetrics(rows, { minImpressions: 100 }),
    ).toEqual([]);
  });
});
