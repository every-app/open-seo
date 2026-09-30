import { describe, expect, it } from "vitest";
import {
  hasActiveMetricFilters,
  searchPerformanceInputSchema,
  searchPerformanceTableInputSchema,
} from "@/types/schemas/search-performance";

describe("searchPerformanceInputSchema", () => {
  it("accepts page path and partial metric ranges", () => {
    const parsed = searchPerformanceInputSchema.parse({
      projectId: "p1",
      pagePath: "/blogs/*",
      excludePagePath: "/tag/",
      minImpressions: 10,
      maxPosition: 20,
    });

    expect(parsed.pagePath).toBe("/blogs/*");
    expect(parsed.excludePagePath).toBe("/tag/");
    expect(parsed.minImpressions).toBe(10);
    expect(parsed.maxPosition).toBe(20);
  });

  it("treats blank page path as unset", () => {
    const parsed = searchPerformanceInputSchema.parse({
      projectId: "p1",
      pagePath: "   ",
    });

    expect(parsed.pagePath).toBeUndefined();
  });

  it("rejects impressions min greater than max", () => {
    expect(() =>
      searchPerformanceInputSchema.parse({
        projectId: "p1",
        minImpressions: 100,
        maxImpressions: 10,
      }),
    ).toThrow(/Impressions minimum cannot exceed maximum/);
  });

  it("rejects negative clicks", () => {
    expect(() =>
      searchPerformanceInputSchema.parse({
        projectId: "p1",
        minClicks: -1,
      }),
    ).toThrow();
  });
});

describe("searchPerformanceTableInputSchema", () => {
  it("accepts metric filters with pagination", () => {
    const parsed = searchPerformanceTableInputSchema.parse({
      projectId: "p1",
      dimension: "page",
      page: 2,
      pageSize: 50,
      minClicks: 5,
    });

    expect(parsed.page).toBe(2);
    expect(parsed.minClicks).toBe(5);
  });
});

describe("hasActiveMetricFilters", () => {
  it("returns false when no metric bounds are set", () => {
    expect(hasActiveMetricFilters({})).toBe(false);
  });

  it("returns true when any metric bound is set", () => {
    expect(hasActiveMetricFilters({ maxPosition: 10 })).toBe(true);
  });
});
