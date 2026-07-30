import { describe, expect, it } from "vitest";
import { summarizeRankRows } from "@/server/features/dashboard/services/rankSummary";

const device = (position: number | null, previousPosition: number | null) => ({
  position,
  previousPosition,
});

describe("summarizeRankRows", () => {
  it("counts a keyword ranking on both devices once, not once per device", () => {
    const counts = summarizeRankRows([
      { desktop: device(3, 8), mobile: device(9, null) },
    ]);

    expect(counts.trackedKeywords).toBe(1);
    expect(counts.top10).toBe(1);
    expect(counts.improved).toBe(1);
    expect(counts.declined).toBe(0);
  });

  it("never lets top10 exceed the tracked keyword count", () => {
    const counts = summarizeRankRows([
      { desktop: device(2, 2), mobile: device(4, 4) },
      { desktop: device(5, 5), mobile: device(6, 6) },
    ]);

    expect(counts.trackedKeywords).toBe(2);
    expect(counts.top10).toBe(2);
  });

  it("uses the best device position for the top-10 check", () => {
    const counts = summarizeRankRows([
      { desktop: device(40, 40), mobile: device(7, 7) },
    ]);

    expect(counts.top10).toBe(1);
  });

  it("ignores a keyword with no current position on either device", () => {
    const counts = summarizeRankRows([
      { desktop: device(null, 4), mobile: device(null, null) },
    ]);

    expect(counts.trackedKeywords).toBe(1);
    expect(counts.top10).toBe(0);
    expect(counts.improved).toBe(0);
    expect(counts.declined).toBe(0);
  });

  it("returns zeroed counts for no rows", () => {
    expect(summarizeRankRows([])).toEqual({
      trackedKeywords: 0,
      improved: 0,
      declined: 0,
      top10: 0,
    });
  });
});
