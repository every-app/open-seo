import { describe, expect, it } from "vitest";
import {
  compileAdvancedSearchPerformanceFilters,
  getAdvancedSearchPerformanceFilterErrors,
  validateMetricValue,
} from "@/client/features/search-performance/SearchPerformanceAdvancedFilters";

describe("validateMetricValue", () => {
  it("flags non-numeric input", () => {
    expect(validateMetricValue("abc", "nonNegativeInt")).toBe(
      "Enter a valid number",
    );
  });

  it("flags negative impressions", () => {
    expect(validateMetricValue("-1", "nonNegativeInt")).toBe(
      "Must be 0 or greater",
    );
  });

  it("flags non-positive position bounds", () => {
    expect(validateMetricValue("0", "positiveNumber")).toBe(
      "Must be greater than 0",
    );
  });
});

describe("getAdvancedSearchPerformanceFilterErrors", () => {
  it("flags min greater than max", () => {
    expect(
      getAdvancedSearchPerformanceFilterErrors({
        pagePath: "",
        minImpressions: "100",
        maxImpressions: "10",
        minClicks: "",
        maxClicks: "",
        minPosition: "",
        maxPosition: "",
      }),
    ).toEqual({
      minImpressions: "Min cannot exceed max",
      maxImpressions: "Min cannot exceed max",
    });
  });
});

describe("compileAdvancedSearchPerformanceFilters", () => {
  it("keeps valid path filters when a metric field is invalid", () => {
    expect(
      compileAdvancedSearchPerformanceFilters({
        pagePath: "/blogs/",
        minImpressions: "abc",
        maxImpressions: "",
        minClicks: "",
        maxClicks: "",
        minPosition: "",
        maxPosition: "",
      }),
    ).toEqual({ pagePath: "/blogs/" });
  });
});
