import { describe, expect, it } from "vitest";
import type { RankTrackingRow } from "@/types/schemas/rank-tracking";
import {
  applyFilters,
  EMPTY_FILTERS,
  matchesPositionFilter,
  type Filters,
} from "./RankTrackingFilters";

function makeRow(
  keyword: string,
  desktopPosition: number | null,
  mobilePosition: number | null,
): RankTrackingRow {
  return {
    trackingKeywordId: keyword,
    keyword,
    searchVolume: null,
    keywordDifficulty: null,
    cpc: null,
    desktop: {
      position: desktopPosition,
      previousPosition: null,
      rankingUrl: null,
      serpFeatures: [],
    },
    mobile: {
      position: mobilePosition,
      previousPosition: null,
      rankingUrl: null,
      serpFeatures: [],
    },
  };
}

function withFilters(overrides: Partial<Filters>): Filters {
  return { ...EMPTY_FILTERS, ...overrides };
}

describe("matchesPositionFilter", () => {
  it("matches only unranked positions when max is zero", () => {
    expect(matchesPositionFilter(null, "", "0")).toBe(true);
    expect(matchesPositionFilter(1, "", "0")).toBe(false);
    expect(matchesPositionFilter(20, "10", "0")).toBe(false);
  });

  it("keeps regular rank ranges unchanged", () => {
    expect(matchesPositionFilter(4, "1", "10")).toBe(true);
    expect(matchesPositionFilter(11, "1", "10")).toBe(false);
    expect(matchesPositionFilter(null, "1", "10")).toBe(false);
  });
});

describe("applyFilters", () => {
  const rows = [
    makeRow("ranked both", 3, 6),
    makeRow("desktop unranked", null, 5),
    makeRow("mobile unranked", 7, null),
    makeRow("unranked both", null, null),
  ];

  it("filters desktop unranked rows with desktop max zero", () => {
    expect(
      applyFilters(rows, withFilters({ maxDesktopPos: "0" })).map(
        (row) => row.keyword,
      ),
    ).toEqual(["desktop unranked", "unranked both"]);
  });

  it("filters mobile unranked rows with mobile max zero", () => {
    expect(
      applyFilters(rows, withFilters({ maxMobilePos: "0" })).map(
        (row) => row.keyword,
      ),
    ).toEqual(["mobile unranked", "unranked both"]);
  });

  it("requires both devices to be unranked when both max values are zero", () => {
    expect(
      applyFilters(
        rows,
        withFilters({ maxDesktopPos: "0", maxMobilePos: "0" }),
      ).map((row) => row.keyword),
    ).toEqual(["unranked both"]);
  });
});
