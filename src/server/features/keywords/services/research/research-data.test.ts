import { describe, expect, it } from "vitest";

import type { KeywordIdeaItem } from "@/server/lib/keyword-providers/types";
import { mapProviderItems } from "./research-data";

describe("mapProviderItems", () => {
  it("maps Google Ads idea rows to research rows without KD/intent", () => {
    const rows = mapProviderItems([
      {
        keyword: "Hotel Reykjavik",
        searchVolume: 1300,
        cpc: 2.54,
        competition: 0.42,
        monthlySearches: [{ year: 2026, month: 5, searchVolume: 1300 }],
      },
    ]);

    expect(rows).toEqual([
      {
        keyword: "hotel reykjavik",
        searchVolume: 1300,
        trend: [{ year: 2026, month: 5, searchVolume: 1300 }],
        cpc: 2.54,
        competition: 0.42,
        keywordDifficulty: null,
        intent: "unknown",
      },
    ]);
  });

  it("maps Bing idea rows (no monthly history) with null trend", () => {
    const items: KeywordIdeaItem[] = [
      {
        keyword: "northern lights tour",
        searchVolume: 320,
        cpc: null,
        competition: 0.25,
        monthlySearches: [],
      },
    ];
    const rows = mapProviderItems(items);

    expect(rows).toEqual([
      {
        keyword: "northern lights tour",
        searchVolume: 320,
        trend: [],
        cpc: null,
        competition: 0.25,
        keywordDifficulty: null,
        intent: "unknown",
      },
    ]);
  });

  it("dedupes case-variant keywords and skips empty ones", () => {
    const items: KeywordIdeaItem[] = [
      {
        keyword: "iceland itinerary",
        searchVolume: 100,
        cpc: null,
        competition: null,
        monthlySearches: [],
      },
      {
        keyword: "Iceland Itinerary",
        searchVolume: 100,
        cpc: null,
        competition: null,
        monthlySearches: [],
      },
      {
        keyword: "",
        searchVolume: 50,
        cpc: null,
        competition: null,
        monthlySearches: [],
      },
    ];
    const rows = mapProviderItems(items);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      keyword: "iceland itinerary",
      searchVolume: 100,
      competition: null,
      cpc: null,
      trend: [],
    });
  });
});
