import { describe, expect, it } from "vitest";
import type { EnrichedKeyword } from "./helpers";
import { filterTopicallyRelevantRows } from "./selection";

describe("filterTopicallyRelevantRows", () => {
  it("rejects expansions that only match one token from the seed", () => {
    const rows: EnrichedKeyword[] = [
      {
        keyword: "answering service miami",
        searchVolume: 0,
        trend: [],
        cpc: null,
        competition: null,
        keywordDifficulty: null,
        intent: "unknown",
      },
      {
        keyword: "miami dolphins vs chargers",
        searchVolume: 201_000,
        trend: [],
        cpc: null,
        competition: null,
        keywordDifficulty: null,
        intent: "informational",
      },
      {
        keyword: "chargers game today",
        searchVolume: 90_500,
        trend: [],
        cpc: null,
        competition: null,
        keywordDifficulty: null,
        intent: "informational",
      },
    ];

    expect(
      filterTopicallyRelevantRows(rows, "answering service Miami"),
    ).toEqual([]);
  });
});
