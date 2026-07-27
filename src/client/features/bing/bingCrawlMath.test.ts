import { describe, expect, it } from "vitest";
import {
  buildCrawlTiles,
  totalErrors,
  type BingCrawlRow,
} from "./bingCrawlMath";

function row(overrides: Partial<BingCrawlRow> = {}): BingCrawlRow {
  return {
    date: "2026-07-01T00:00:00.000Z",
    crawledPages: 100,
    inIndex: 50,
    inLinks: 120,
    crawlErrors: 0,
    code4xx: 0,
    code5xx: 0,
    blockedByRobotsTxt: 0,
    allOtherCodes: 0,
    ...overrides,
  };
}

describe("totalErrors", () => {
  it("sums crawl errors and 4xx/5xx", () => {
    expect(totalErrors(row({ crawlErrors: 2, code4xx: 1, code5xx: 3 }))).toBe(
      6,
    );
  });
});

describe("buildCrawlTiles", () => {
  it("returns null for an empty series", () => {
    expect(buildCrawlTiles([])).toBeNull();
  });

  it("uses the latest row and a ~28-day baseline for deltas", () => {
    const rows = Array.from({ length: 40 }, (_, i) =>
      row({ inIndex: 40 + i, inLinks: 100 + i }),
    );
    const tiles = buildCrawlTiles(rows);
    // latest = index 39; baseline = index 39 - 28 = 11
    expect(tiles?.inIndex).toEqual({ value: 79, delta: 28 });
    expect(tiles?.inLinks).toEqual({ value: 139, delta: 28 });
  });

  it("falls back to the series start when shorter than 28 days", () => {
    const rows = Array.from({ length: 10 }, (_, i) => row({ inIndex: 50 + i }));
    const tiles = buildCrawlTiles(rows);
    expect(tiles?.inIndex).toEqual({ value: 59, delta: 9 });
  });

  it("reports no delta for a very short series", () => {
    const tiles = buildCrawlTiles([row(), row({ inIndex: 51 })]);
    expect(tiles?.inIndex).toEqual({ value: 51, delta: null });
  });

  it("sums errors over the last 7 rows only", () => {
    const rows = [
      ...Array.from({ length: 10 }, () => row({ crawlErrors: 100 })),
      ...Array.from({ length: 7 }, () => row({ crawlErrors: 1, code4xx: 1 })),
    ];
    expect(buildCrawlTiles(rows)?.errors7d).toBe(14);
  });
});
