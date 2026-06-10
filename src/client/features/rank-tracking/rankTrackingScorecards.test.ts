import { describe, expect, it } from "vitest";
import type {
  RankTrackingDeviceResult,
  RankTrackingRow,
} from "@/types/schemas/rank-tracking";
import { computeScorecards } from "./rankTrackingScorecards";

function device(
  position: number | null,
  previousPosition: number | null,
): RankTrackingDeviceResult {
  return { position, previousPosition, rankingUrl: null, serpFeatures: [] };
}

function row(
  desktop: RankTrackingDeviceResult,
  mobile: RankTrackingDeviceResult = device(null, null),
  searchVolume: number | null = null,
): RankTrackingRow {
  return {
    trackingKeywordId: crypto.randomUUID(),
    keyword: "kw",
    searchVolume,
    keywordDifficulty: null,
    cpc: null,
    desktop,
    mobile,
  };
}

describe("computeScorecards", () => {
  it("counts ranking keywords and the delta vs the comparison period", () => {
    const rows = [row(device(2, 5)), row(device(null, 8))];
    const result = computeScorecards(rows, "desktop");
    // Only one keyword currently ranks (position 2); two ranked previously.
    expect(result.ranking).toBe(1);
    expect(result.rankingDelta).toBe(-1);

    const empty = computeScorecards([row(device(null, null))], "desktop");
    expect(empty.ranking).toBe(0);
    expect(empty.rankingDelta).toBe(0);
  });

  it("counts Top 3 and Top 10 (Top 3 subset of Top 10)", () => {
    const rows = [
      row(device(1, null)),
      row(device(3, null)),
      row(device(9, null)),
      row(device(15, null)),
    ];
    const result = computeScorecards(rows, "desktop");
    expect(result.top3).toBe(2);
    expect(result.top10).toBe(3);
  });

  it("computes volume-weighted visibility (0–100%) and its delta", () => {
    // A single keyword at #1 captures the full click potential → 100%.
    const top = computeScorecards(
      [row(device(1, null), undefined, 1000)],
      "desktop",
    );
    expect(top.visibility).toBe(100);
    expect(top.visibilityDelta).toBe(100); // was unranked (0%), now 100%

    // Ranking but not found now → 0% visibility.
    const lost = computeScorecards(
      [row(device(null, 1), undefined, 1000)],
      "desktop",
    );
    expect(lost.visibility).toBe(0);

    // No volume anywhere → not computable.
    const noVolume = computeScorecards([row(device(1, 1))], "desktop");
    expect(noVolume.visibility).toBeNull();
    expect(noVolume.visibilityDelta).toBeNull();
  });

  it("classifies improved/declined with the 4-case null rules", () => {
    const rows = [
      row(device(2, 5)), // moved up -> improved
      row(device(8, 4)), // moved down -> declined
      row(device(3, null)), // new entry -> improved
      row(device(null, 6)), // lost ranking -> declined
      row(device(null, null)), // nothing -> neither
      row(device(7, 7)), // unchanged -> neither
    ];
    const result = computeScorecards(rows, "desktop");
    expect(result.improved).toBe(2);
    expect(result.declined).toBe(2);
  });
});
