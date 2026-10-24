import { describe, expect, it } from "vitest";
import { filterQueries, filterTopPages } from "./brandLookupFiltering";
import {
  EMPTY_QUERIES_FILTERS,
  EMPTY_TOP_PAGES_FILTERS,
} from "./brandLookupFilterTypes";
import type { BrandLookupResult } from "@/types/schemas/ai-search";

type TopQuery = BrandLookupResult["topQueries"][number];
type TopPage = BrandLookupResult["topPages"][number];

function topQuery(question: string, aiSearchVolume: number | null): TopQuery {
  return {
    question,
    platform: "chat_gpt",
    aiSearchVolume,
    firstSeenAt: null,
    lastSeenAt: null,
    citedSources: [],
    brandsMentioned: [],
  };
}

function topPage(url: string, mentions: number | null): TopPage {
  return {
    url,
    domain: null,
    platform: "chat_gpt",
    mentions,
    capturedVolume: null,
    keywords: [],
  };
}

describe("filterQueries", () => {
  it("excludes null-volume rows when a min bound is set", () => {
    const rows = [
      topQuery("has volume", 500),
      topQuery("unknown volume", null),
    ];
    const result = filterQueries(rows, {
      ...EMPTY_QUERIES_FILTERS,
      minVolume: "100",
    });
    expect(result.map((r) => r.question)).toEqual(["has volume"]);
  });

  it("keeps null-volume rows when no numeric bound is set", () => {
    const rows = [topQuery("unknown volume", null)];
    expect(filterQueries(rows, EMPTY_QUERIES_FILTERS)).toHaveLength(1);
  });
});

describe("filterTopPages", () => {
  it("excludes null-mention rows when a min bound is set", () => {
    const rows = [topPage("/a", 20), topPage("/b", null)];
    const result = filterTopPages(rows, {
      ...EMPTY_TOP_PAGES_FILTERS,
      minMentions: "5",
    });
    expect(result.map((r) => r.url)).toEqual(["/a"]);
  });
});
