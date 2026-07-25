import { describe, expect, it } from "vitest";
import {
  aggregateBingStatRows,
  buildBingStrikingRows,
  type BingAggregateRow,
} from "./bingQueryReport";

function row(
  key: string,
  clicks: number,
  impressions: number,
  avgImpressionPosition: number,
  date: string | null = "2026-05-01T00:00:00.000Z",
) {
  return { key, clicks, impressions, date, avgImpressionPosition };
}

describe("aggregateBingStatRows", () => {
  it("sums sampled rows per key and weights position by impressions", () => {
    const rows = aggregateBingStatRows([
      row("open seo", 2, 100, 5),
      row("open seo", 3, 300, 9),
      row("other", 1, 50, 12),
    ]);
    expect(rows).toEqual([
      {
        key: "open seo",
        clicks: 5,
        impressions: 400,
        ctr: 5 / 400,
        // (5*100 + 9*300) / 400 = 8
        position: 8,
      },
      { key: "other", clicks: 1, impressions: 50, ctr: 1 / 50, position: 12 },
    ]);
  });

  it("excludes non-positive positions from weighting but keeps their traffic", () => {
    const rows = aggregateBingStatRows([
      row("q", 1, 100, -1),
      row("q", 2, 200, 6),
    ]);
    expect(rows[0]).toMatchObject({
      clicks: 3,
      impressions: 300,
      position: 6,
    });
  });

  it("returns null position when no sampled row carried one", () => {
    const rows = aggregateBingStatRows([row("q", 0, 100, -1)]);
    expect(rows[0].position).toBeNull();
  });

  it("returns 0 ctr for zero impressions", () => {
    const rows = aggregateBingStatRows([row("q", 0, 0, 3)]);
    expect(rows[0].ctr).toBe(0);
    // zero-impression rows also contribute no position weight
    expect(rows[0].position).toBeNull();
  });

  it("sorts by clicks desc then impressions desc", () => {
    const rows = aggregateBingStatRows([
      row("a", 1, 10, 5),
      row("b", 5, 10, 5),
      row("c", 1, 99, 5),
    ]);
    expect(rows.map((r) => r.key)).toEqual(["b", "c", "a"]);
  });
});

describe("buildBingStrikingRows", () => {
  function agg(key: string, position: number | null, impressions = 10) {
    return {
      key,
      clicks: 1,
      impressions,
      ctr: 0.1,
      position,
    } satisfies BingAggregateRow;
  }

  it("keeps only positions 5-20 inclusive", () => {
    const rows = buildBingStrikingRows([
      agg("below", 4.9),
      agg("low-edge", 5),
      agg("mid", 12),
      agg("high-edge", 20),
      agg("above", 20.1),
      agg("none", null),
    ]);
    expect(rows.map((r) => r.key)).toEqual(
      expect.arrayContaining(["low-edge", "mid", "high-edge"]),
    );
    expect(rows).toHaveLength(3);
  });

  it("sorts by impressions desc", () => {
    const rows = buildBingStrikingRows([
      agg("small", 10, 5),
      agg("big", 10, 500),
      agg("medium", 10, 50),
    ]);
    expect(rows.map((r) => r.key)).toEqual(["big", "medium", "small"]);
  });
});
