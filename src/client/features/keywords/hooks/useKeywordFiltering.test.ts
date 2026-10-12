import { identity, sortBy } from "remeda";
import { describe, expect, it } from "vitest";
import type { KeywordIntent, KeywordResearchRow } from "@/types/keywords";
import {
  EMPTY_FILTERS,
  parseIntentFilter,
  toggleIntentFilter,
  type KeywordFilterValues,
} from "@/client/features/keywords/keywordResearchTypes";
import { applyKeywordFiltersAndSort } from "./useKeywordFiltering";

function makeRow(keyword: string, intent: KeywordIntent): KeywordResearchRow {
  return {
    keyword,
    searchVolume: 100,
    trend: [],
    keywordDifficulty: 10,
    cpc: 1,
    competition: 0.5,
    intent,
  };
}

function filter(
  rows: KeywordResearchRow[],
  overrides: Partial<KeywordFilterValues>,
): KeywordResearchRow[] {
  return applyKeywordFiltersAndSort({
    rows,
    filters: { ...EMPTY_FILTERS, ...overrides },
    sortField: "keyword",
    sortDir: "asc",
  });
}

const rows: KeywordResearchRow[] = [
  makeRow("buy running shoes", "transactional"),
  makeRow("best running shoes", "commercial"),
  makeRow("how to run", "informational"),
  makeRow("nike store", "navigational"),
  makeRow("mystery term", "unknown"),
];

describe("toggleIntentFilter", () => {
  it("adds and removes intents while keeping canonical order", () => {
    expect(parseIntentFilter("transactional,informational")).toEqual([
      "informational",
      "transactional",
    ]);
    expect(toggleIntentFilter("transactional", "informational")).toBe(
      "informational,transactional",
    );
    expect(
      toggleIntentFilter("informational,transactional", "informational"),
    ).toBe("transactional");
  });
});

describe("applyKeywordFiltersAndSort — intent filtering", () => {
  it("keeps rows matching any of multiple selected intents", () => {
    const result = filter(rows, { intents: "transactional,commercial" });
    expect(
      sortBy(
        result.map((r) => r.keyword),
        identity(),
      ),
    ).toEqual(["best running shoes", "buy running shoes"]);
  });

  it("ignores invalid intent tokens (treated as no intent match constraint)", () => {
    expect(parseIntentFilter("commercial,bogus,commercial")).toEqual([
      "commercial",
    ]);
    expect(filter(rows, { intents: "bogus" })).toHaveLength(rows.length);
  });
});
