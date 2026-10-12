import { describe, expect, it } from "vitest";
import { interleaveRows, type EnrichedKeyword } from "./helpers";

const row = (keyword: string): EnrichedKeyword => ({
  keyword,
  searchVolume: 1000,
  trend: [{ year: 2026, month: 7, searchVolume: 1000 }],
  cpc: 1.5,
  competition: 0.4,
  keywordDifficulty: 20,
  intent: "informational",
});

describe("interleaveRows", () => {
  it.each([
    {
      name: "alternates sources, dedupes by keyword, and respects the limit",
      first: ["a", "b", "c"],
      second: ["x", "a", "y"],
      limit: 4,
      expected: ["a", "x", "b", "c"],
    },
    {
      name: "drains the longer source when the other runs out",
      first: ["a"],
      second: ["x", "y", "z"],
      limit: 10,
      expected: ["a", "x", "y", "z"],
    },
  ])("$name", ({ first, second, limit, expected }) => {
    const rows = interleaveRows(first.map(row), second.map(row), limit);
    expect(rows.map((r) => r.keyword)).toEqual(expected);
  });
});
