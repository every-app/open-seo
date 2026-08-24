import { describe, expect, it } from "vitest";
import {
  shapeCruxHistory,
  shapeCruxRecord,
} from "@/server/features/crux/cruxShaping";
import { cwvRating } from "@/shared/cwv";

describe("shapeCruxRecord", () => {
  it("shapes present metrics, coerces string CLS values, and nulls missing metrics", () => {
    const shaped = shapeCruxRecord({
      key: { origin: "https://example.com" },
      metrics: {
        largest_contentful_paint: {
          histogram: [
            { start: 0, end: 2500, density: 0.85 },
            { start: 2500, end: 4000, density: 0.1 },
            { start: 4000, density: 0.05 },
          ],
          percentiles: { p75: 1801 },
        },
        // CrUX serializes CLS numbers as strings on the wire.
        cumulative_layout_shift: {
          histogram: [
            { start: "0.00", end: "0.10", density: 0.9 },
            { start: "0.10", end: "0.25", density: 0.07 },
            { start: "0.25", density: 0.03 },
          ],
          percentiles: { p75: "0.05" },
        },
      },
      collectionPeriod: {
        firstDate: { year: 2026, month: 7, day: 27 },
        lastDate: { year: 2026, month: 8, day: 23 },
      },
    });

    expect(shaped.lcpMs).toEqual({
      p75: 1801,
      good: 0.85,
      needsImprovement: 0.1,
      poor: 0.05,
    });
    expect(shaped.cls?.p75).toBe(0.05);
    expect(shaped.inpMs).toBeNull();
    expect(shaped.ttfbMs).toBeNull();
    expect(shaped.collectionPeriod).toEqual({
      firstDate: "2026-07-27",
      lastDate: "2026-08-23",
    });
  });
});

describe("shapeCruxHistory", () => {
  it("aligns weekly p75s with collection periods and keeps null weeks", () => {
    const rows = shapeCruxHistory({
      metrics: {
        largest_contentful_paint: {
          percentilesTimeseries: { p75s: [1900, null] },
        },
        cumulative_layout_shift: {
          percentilesTimeseries: { p75s: ["0.08", "0.12"] },
        },
      },
      collectionPeriods: [
        {
          firstDate: { year: 2026, month: 7, day: 13 },
          lastDate: { year: 2026, month: 8, day: 9 },
        },
        {
          firstDate: { year: 2026, month: 7, day: 20 },
          lastDate: { year: 2026, month: 8, day: 16 },
        },
      ],
    });

    expect(rows).toEqual([
      { weekEnd: "2026-08-09", lcpMs: 1900, inpMs: null, cls: 0.08 },
      { weekEnd: "2026-08-16", lcpMs: null, inpMs: null, cls: 0.12 },
    ]);
  });
});

describe("cwvRating", () => {
  it("rates a p75 at the threshold as good and above it as poor", () => {
    expect(cwvRating("lcpMs", 2500)).toBe("good");
    expect(cwvRating("inpMs", 201)).toBe("poor");
    expect(cwvRating("cls", 0.1)).toBe("good");
  });
});
