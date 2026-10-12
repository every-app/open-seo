import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: vi.fn(),
}));

import type { AdsKeywordIdeaItem } from "@/server/lib/dataforseo";
import { mapAdsKeywordItems } from "./research-data";

describe("mapAdsKeywordItems", () => {
  it("dedupes case-variant keywords and skips empty ones", () => {
    const items: AdsKeywordIdeaItem[] = [
      { keyword: "northern lights tour", search_volume: 320 },
      { keyword: "Northern Lights Tour", search_volume: 320 },
      { keyword: undefined },
    ];
    const rows = mapAdsKeywordItems(items);

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
