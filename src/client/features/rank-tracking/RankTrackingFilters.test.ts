import { describe, expect, it } from "vitest";
import type { RankTrackingRow } from "@/types/schemas/rank-tracking";
import {
  applyDomainListFilters,
  applyFilters,
  countActiveDomainListFilters,
  EMPTY_DOMAIN_LIST_FILTERS,
  EMPTY_FILTERS,
  getDomainListFilterOptions,
  matchesMetricRangeFilter,
  matchesPositionFilter,
  type DomainListFilters,
  type Filters,
} from "./RankTrackingFilters";

type DomainSummary = {
  id: string;
  domain: string;
  devices: "both" | "desktop" | "mobile";
  locationCode: number;
};

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

function withFilters(overrides: Partial<Filters>): Filters {
  return { ...EMPTY_FILTERS, ...overrides };
}

function makeSummary(
  id: string,
  domain: string,
  devices: DomainSummary["devices"],
  locationCode: number,
): DomainSummary {
  return { id, domain, devices, locationCode };
}

function withDomainFilters(
  overrides: Partial<DomainListFilters>,
): DomainListFilters {
  return { ...EMPTY_DOMAIN_LIST_FILTERS, ...overrides };
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

describe("applyDomainListFilters", () => {
  const summaries = [
    makeSummary("alpha-us-mobile", "alpha.example.com", "mobile", 2840),
    makeSummary("alpha-fr-desktop", "alpha.example.com", "desktop", 2250),
    makeSummary("alpha-fr-mobile", "alpha.example.com", "mobile", 2250),
    makeSummary("bravo-fr-both", "bravo.example.com", "both", 2250),
    makeSummary("charlie-uk-desktop", "charlie.example.com", "desktop", 2826),
  ];

  it("narrows by text query and restores all when cleared", () => {
    expect(
      applyDomainListFilters(
        summaries,
        withDomainFilters({ query: "ALPHA" }),
      ).map((summary) => summary.id),
    ).toEqual(["alpha-us-mobile", "alpha-fr-desktop", "alpha-fr-mobile"]);

    expect(
      applyDomainListFilters(summaries, EMPTY_DOMAIN_LIST_FILTERS).map(
        (summary) => summary.id,
      ),
    ).toEqual(summaries.map((summary) => summary.id));
  });

  it("filters by device", () => {
    expect(
      applyDomainListFilters(
        summaries,
        withDomainFilters({ device: "mobile" }),
      ).map((summary) => summary.id),
    ).toEqual(["alpha-us-mobile", "alpha-fr-mobile"]);
  });

  it("filters by country", () => {
    expect(
      applyDomainListFilters(
        summaries,
        withDomainFilters({ locationCode: "2250" }),
      ).map((summary) => summary.id),
    ).toEqual(["alpha-fr-desktop", "alpha-fr-mobile", "bravo-fr-both"]);
  });

  it("combines domain, device, and country filters with AND semantics", () => {
    expect(
      applyDomainListFilters(
        summaries,
        withDomainFilters({
          query: "alpha",
          device: "mobile",
          locationCode: "2250",
        }),
      ).map((summary) => summary.id),
    ).toEqual(["alpha-fr-mobile"]);
  });

  it("returns an empty list when filters match nothing", () => {
    expect(
      applyDomainListFilters(
        summaries,
        withDomainFilters({ query: "missing", device: "mobile" }),
      ),
    ).toEqual([]);
  });
});

describe("getDomainListFilterOptions", () => {
  it("derives distinct device and country options from available summaries", () => {
    const options = getDomainListFilterOptions([
      makeSummary("a", "a.com", "mobile", 2250),
      makeSummary("b", "b.com", "desktop", 2250),
      makeSummary("c", "c.com", "mobile", 2826),
    ]);

    expect(options.devices).toEqual([
      { value: "desktop", label: "Desktop" },
      { value: "mobile", label: "Mobile" },
    ]);
    expect(options.locations).toEqual([
      { value: "2250", label: "FR" },
      { value: "2826", label: "UK" },
    ]);
  });
});

describe("countActiveDomainListFilters", () => {
  it("counts non-empty domain list filters", () => {
    expect(countActiveDomainListFilters(EMPTY_DOMAIN_LIST_FILTERS)).toBe(0);
    expect(
      countActiveDomainListFilters(
        withDomainFilters({
          query: "alpha",
          device: "desktop",
          locationCode: "2840",
        }),
      ),
    ).toBe(3);
  });
});

describe("matchesMetricRangeFilter", () => {
  it("matches everything when no bounds are set", () => {
    expect(matchesMetricRangeFilter(null, "", "")).toBe(true);
    expect(matchesMetricRangeFilter(500, "", "")).toBe(true);
  });

  it("excludes null values once a bound is set", () => {
    expect(matchesMetricRangeFilter(null, "10", "")).toBe(false);
    expect(matchesMetricRangeFilter(null, "", "100")).toBe(false);
  });

  it("treats zero as a real value, not 'no data'", () => {
    expect(matchesMetricRangeFilter(0, "0", "10")).toBe(true);
    expect(matchesMetricRangeFilter(0, "1", "10")).toBe(false);
  });

  it("respects min-only and max-only bounds", () => {
    expect(matchesMetricRangeFilter(50, "20", "")).toBe(true);
    expect(matchesMetricRangeFilter(10, "20", "")).toBe(false);
    expect(matchesMetricRangeFilter(50, "", "40")).toBe(false);
    expect(matchesMetricRangeFilter(50, "", "60")).toBe(true);
  });
});

describe("applyFilters metric ranges", () => {
  const rows = [
    makeRow("high volume", 3, 6, { volume: 5000, kd: 40, cpc: 2.5 }),
    makeRow("low volume", 3, 6, { volume: 10, kd: 80, cpc: 0.1 }),
    makeRow("no data", 3, 6, {}),
  ];

  it("filters by volume range", () => {
    expect(
      applyFilters(rows, withFilters({ minVolume: "100" })).map(
        (row) => row.keyword,
      ),
    ).toEqual(["high volume"]);
  });

  it("filters by KD range", () => {
    expect(
      applyFilters(rows, withFilters({ maxKd: "50" })).map(
        (row) => row.keyword,
      ),
    ).toEqual(["high volume"]);
  });

  it("filters by CPC range", () => {
    expect(
      applyFilters(rows, withFilters({ minCpc: "1" })).map(
        (row) => row.keyword,
      ),
    ).toEqual(["high volume"]);
  });

  it("excludes rows without metric data once a metric filter is active", () => {
    expect(
      applyFilters(rows, withFilters({ minVolume: "0" })).map(
        (row) => row.keyword,
      ),
    ).toEqual(["high volume", "low volume"]);
  });
});
