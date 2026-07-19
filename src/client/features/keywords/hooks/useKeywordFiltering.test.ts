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

describe("parseIntentFilter", () => {
  it("returns an empty list for an empty string", () => {
    expect(parseIntentFilter("")).toEqual([]);
  });

  it("parses a comma-separated string in canonical order", () => {
    expect(parseIntentFilter("transactional,informational")).toEqual([
      "informational",
      "transactional",
    ]);
  });

  it("drops unknown tokens and de-duplicates", () => {
    expect(parseIntentFilter("commercial,bogus,commercial")).toEqual([
      "commercial",
    ]);
  });
});

describe("toggleIntentFilter", () => {
  it("adds an intent when absent and keeps canonical order", () => {
    expect(toggleIntentFilter("transactional", "informational")).toBe(
      "informational,transactional",
    );
  });

  it("removes an intent when already present", () => {
    expect(
      toggleIntentFilter("informational,transactional", "informational"),
    ).toBe("transactional");
  });
});

describe("applyKeywordFiltersAndSort — intent filtering", () => {
  it("returns every row when no intent is selected", () => {
    expect(filter(rows, { intents: "" })).toHaveLength(rows.length);
  });

  it("keeps only rows matching a single selected intent", () => {
    const result = filter(rows, { intents: "transactional" });
    expect(result.map((r) => r.keyword)).toEqual(["buy running shoes"]);
  });

  it("keeps rows matching any of multiple selected intents", () => {
    const result = filter(rows, { intents: "transactional,commercial" });
    expect(result.map((r) => r.keyword).toSorted()).toEqual([
      "best running shoes",
      "buy running shoes",
    ]);
  });

  it("combines the intent filter with other filters (AND)", () => {
    // "running" narrows to the two shoe rows; intent narrows to the commercial one.
    const result = filter(rows, {
      include: "running",
      intents: "commercial",
    });
    expect(result.map((r) => r.keyword)).toEqual(["best running shoes"]);
  });

  it("ignores invalid intent tokens (treated as no intent match constraint)", () => {
    const result = filter(rows, { intents: "bogus" });
    expect(result).toHaveLength(rows.length);
  });
});
