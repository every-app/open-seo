import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: vi.fn(),
}));

import {
  KeywordsDataGoogleAdsKeywordsForKeywordsLiveResultInfo,
  MonthlySearchesInfo,
} from "dataforseo-client";
import { mapAdsKeywordItems } from "./research-data";

const adsItem = (
  data: ConstructorParameters<
    typeof KeywordsDataGoogleAdsKeywordsForKeywordsLiveResultInfo
  >[0],
) => new KeywordsDataGoogleAdsKeywordsForKeywordsLiveResultInfo(data);

describe("mapAdsKeywordItems", () => {
  it("maps Google Ads items to research rows without KD/intent", () => {
    const rows = mapAdsKeywordItems([
      adsItem({
        keyword: "Hotel Reykjavik",
        search_volume: 1300,
        cpc: 2.54,
        competition: "HIGH",
        competition_index: 42,
        monthly_searches: [
          new MonthlySearchesInfo({
            year: 2026,
            month: 5,
            search_volume: 1300,
          }),
        ],
      }),
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

  it("dedupes case-variant keywords and skips empty ones", () => {
    const rows = mapAdsKeywordItems([
      adsItem({ keyword: "northern lights tour", search_volume: 320 }),
      adsItem({ keyword: "Northern Lights Tour", search_volume: 320 }),
      adsItem({ keyword: undefined }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      keyword: "northern lights tour",
      searchVolume: 320,
      competition: null,
      cpc: null,
      trend: [],
    });
  });
});
