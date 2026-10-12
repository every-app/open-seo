import { describe, expect, it } from "vitest";
import type { RankTrackingRow } from "@/types/schemas/rank-tracking";
import {
  applyDomainListFilters,
  applyFilters,
  EMPTY_DOMAIN_LIST_FILTERS,
  EMPTY_FILTERS,
  type Filters,
} from "./RankTrackingFilters";

function makeRow(
  keyword: string,
  desktopPosition: number | null,
  mobilePosition: number | null,
  metrics: {
    volume?: number | null;
    kd?: number | null;
    cpc?: number | null;
  } = {},
): RankTrackingRow {
  return {
    trackingKeywordId: keyword,
    keyword,
    matchCase: false,
    pinned: false,
    searchVolume: metrics.volume ?? null,
    keywordDifficulty: metrics.kd ?? null,
    cpc: metrics.cpc ?? null,
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

function keywords(rows: RankTrackingRow[], overrides: Partial<Filters>) {
  return applyFilters(rows, { ...EMPTY_FILTERS, ...overrides }).map(
    (row) => row.keyword,
  );
}

describe("applyFilters", () => {
  const rows = [
    makeRow("ranked both", 3, 6),
    makeRow("desktop unranked", null, 5),
    makeRow("mobile unranked", 7, null),
    makeRow("unranked both", null, null),
  ];

  it.each([
    [{ maxDesktopPos: "0" }, ["desktop unranked", "unranked both"]],
    [{ maxMobilePos: "0" }, ["mobile unranked", "unranked both"]],
  ])("treats a max position of zero as unranked: %o", (filters, expected) => {
    expect(keywords(rows, filters)).toEqual(expected);
  });

  it("keeps regular rank ranges and excludes unranked rows from them", () => {
    expect(keywords(rows, { minDesktopPos: "1", maxDesktopPos: "10" })).toEqual(
      ["ranked both", "mobile unranked"],
    );
  });
});

describe("applyDomainListFilters", () => {
  it("combines domain, device, and country filters with AND semantics", () => {
    const summaries = [
      {
        id: "alpha-us-mobile",
        domain: "alpha.example.com",
        devices: "mobile" as const,
        locationCode: 2840,
      },
      {
        id: "alpha-fr-desktop",
        domain: "alpha.example.com",
        devices: "desktop" as const,
        locationCode: 2250,
      },
      {
        id: "alpha-fr-mobile",
        domain: "alpha.example.com",
        devices: "mobile" as const,
        locationCode: 2250,
      },
      {
        id: "bravo-fr-both",
        domain: "bravo.example.com",
        devices: "both" as const,
        locationCode: 2250,
      },
    ];

    expect(
      applyDomainListFilters(summaries, {
        ...EMPTY_DOMAIN_LIST_FILTERS,
        query: "alpha",
        device: "mobile",
        locationCode: "2250",
      }).map((summary) => summary.id),
    ).toEqual(["alpha-fr-mobile"]);
  });
});

describe("applyFilters metric ranges", () => {
  const rows = [
    makeRow("high volume", 3, 6, { volume: 5000, kd: 40, cpc: 2.5 }),
    makeRow("low volume", 3, 6, { volume: 10, kd: 80, cpc: 0.1 }),
    makeRow("zero volume", 3, 6, { volume: 0, kd: 0, cpc: 0 }),
    makeRow("no data", 3, 6, {}),
  ];

  it("treats zero as a real value but excludes rows without metric data", () => {
    expect(keywords(rows, { minVolume: "0" })).toEqual([
      "high volume",
      "low volume",
      "zero volume",
    ]);
    expect(keywords(rows, { maxKd: "50" })).toEqual([
      "high volume",
      "zero volume",
    ]);
  });
});
