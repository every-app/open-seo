import { describe, expect, it, vi } from "vitest";

import { fetchKeywordMetricsForList } from "./keyword-metrics";

type Client = Parameters<typeof fetchKeywordMetricsForList>[0];

// Minimal fake client exposing only the two endpoints the helper touches.
function fakeClient(overrides: {
  keywordOverview?: Client["labs"]["keywordOverview"];
  adsSearchVolume?: Client["keywords"]["adsSearchVolume"];
}): Client {
  return {
    labs: { keywordOverview: overrides.keywordOverview ?? vi.fn() },
    keywords: { adsSearchVolume: overrides.adsSearchVolume ?? vi.fn() },
  };
}

describe("fetchKeywordMetricsForList", () => {
  it("normalizes Labs items and prefers clickstream-refined volume/trend", async () => {
    const keywordOverview = vi.fn().mockResolvedValue([
      {
        keyword: "best crm",
        keyword_info: {
          search_volume: 1000,
          cpc: 3.2,
          competition: 0.5,
          competition_level: "MEDIUM",
          monthly_searches: [{ year: 2026, month: 1, search_volume: 1000 }],
        },
        keyword_info_normalized_with_clickstream: {
          search_volume: 880,
          monthly_searches: [{ year: 2026, month: 1, search_volume: 880 }],
        },
        keyword_properties: { keyword_difficulty: 42 },
        search_intent_info: { main_intent: "commercial" },
      },
    ]);
    const client = fakeClient({ keywordOverview });

    const rows = await fetchKeywordMetricsForList(client, {
      keywords: ["best crm"],
      locationCode: 2840,
      languageCode: "en",
      includeClickstreamData: true,
      creditFeature: "keyword_research",
    });

    expect(keywordOverview).toHaveBeenCalledWith({
      keywords: ["best crm"],
      locationCode: 2840,
      languageCode: "en",
      includeClickstreamData: true,
      creditFeature: "keyword_research",
    });
    expect(rows).toEqual([
      {
        keyword: "best crm",
        searchVolume: 880,
        cpc: 3.2,
        competition: 0.5,
        competitionLevel: "MEDIUM",
        keywordDifficulty: 42,
        intent: "commercial",
        monthlySearches: [{ year: 2026, month: 1, searchVolume: 880 }],
      },
    ]);
  });

  it("routes Google Ads locations and scales competition_index to a 0-1 ratio", async () => {
    const adsSearchVolume = vi.fn().mockResolvedValue([
      {
        keyword: "hotel reykjavik",
        search_volume: 1300,
        cpc: 2.54,
        competition: "HIGH",
        competition_index: 42,
        monthly_searches: [{ year: 2026, month: 5, search_volume: 1300 }],
      },
      { keyword: undefined },
    ]);
    const client = fakeClient({ adsSearchVolume });

    const rows = await fetchKeywordMetricsForList(client, {
      keywords: ["hotel reykjavik"],
      locationCode: 2352,
      languageCode: "is",
      creditFeature: "rank_tracking",
    });

    expect(adsSearchVolume).toHaveBeenCalledWith({
      keywords: ["hotel reykjavik"],
      locationCode: 2352,
      languageCode: "is",
      creditFeature: "rank_tracking",
    });
    // Item without a keyword is dropped; Ads carries no KD/intent.
    expect(rows).toEqual([
      {
        keyword: "hotel reykjavik",
        searchVolume: 1300,
        cpc: 2.54,
        competition: 0.42,
        competitionLevel: "HIGH",
        keywordDifficulty: null,
        intent: null,
        monthlySearches: [{ year: 2026, month: 5, searchVolume: 1300 }],
      },
    ]);
  });

  it("batches keyword lists above the per-call cap", async () => {
    const keywordOverview = vi
      .fn()
      .mockImplementation(({ keywords }: { keywords: string[] }) =>
        Promise.resolve(
          keywords.map((keyword) => ({ keyword, keyword_info: {} })),
        ),
      );
    const client = fakeClient({ keywordOverview });
    const keywords = Array.from({ length: 1500 }, (_, i) => `kw-${i}`);

    const rows = await fetchKeywordMetricsForList(client, {
      keywords,
      locationCode: 2840,
      languageCode: "en",
      creditFeature: "keyword_research",
    });

    expect(keywordOverview).toHaveBeenCalledTimes(3); // 700 + 700 + 100
    expect(rows).toHaveLength(1500);
  });

  it("merges city-scoped Ads volume with national Labs KD for local requests", async () => {
    const adsSearchVolume = vi.fn().mockResolvedValue([
      {
        keyword: "plumber near me",
        search_volume: 260,
        cpc: 7.54,
        competition: "MEDIUM",
        competition_index: 55,
        monthly_searches: [],
      },
      // "emergency plumber near me" collapsed away by Google Ads normalization.
    ]);
    const keywordOverview = vi.fn().mockResolvedValue([
      {
        keyword: "plumber near me",
        keyword_info: { search_volume: 135000, cpc: 11.29 },
        keyword_properties: { keyword_difficulty: 76 },
        search_intent_info: { main_intent: "transactional" },
      },
      {
        keyword: "emergency plumber near me",
        keyword_info: { search_volume: 135000, cpc: 5.93 },
        keyword_properties: { keyword_difficulty: 17 },
        search_intent_info: { main_intent: "transactional" },
      },
    ]);
    const client = fakeClient({ adsSearchVolume, keywordOverview });

    const rows = await fetchKeywordMetricsForList(client, {
      keywords: ["plumber near me", "emergency plumber near me"],
      locationCode: 2840,
      languageCode: "en",
      locationName: "Springfield,Illinois,United States",
      creditFeature: "rank_tracking",
    });

    expect(adsSearchVolume).toHaveBeenCalledWith(
      expect.objectContaining({
        locationName: "Springfield,Illinois,United States",
      }),
    );
    // Local volume/CPC from Ads, national KD/intent from Labs.
    expect(rows[0]).toMatchObject({
      keyword: "plumber near me",
      searchVolume: 260,
      cpc: 7.54,
      keywordDifficulty: 76,
      intent: "transactional",
    });
    // Keyword Ads dropped: KD/intent survive, but the national volume/CPC
    // must NOT leak into a local request.
    expect(rows[1]).toMatchObject({
      keyword: "emergency plumber near me",
      searchVolume: null,
      cpc: null,
      keywordDifficulty: 17,
      intent: "transactional",
    });
  });
});
