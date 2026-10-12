import { describe, expect, it } from "vitest";
import type { KeywordResearchRow } from "@/types/keywords";
import { groupSharedVolumeRows } from "./groupSharedVolumeRows";

const SERIES = [
  { year: 2026, month: 7, searchVolume: 110000 },
  { year: 2026, month: 8, searchVolume: 90500 },
];

function row(overrides: Partial<KeywordResearchRow>): KeywordResearchRow {
  return {
    keyword: "caregiving",
    searchVolume: 110000,
    trend: SERIES,
    keywordDifficulty: 61,
    cpc: 8.14,
    competition: 0.27,
    intent: "informational",
    ...overrides,
  };
}

describe("groupSharedVolumeRows", () => {
  it("keeps variants visible after their leader with their own metrics", () => {
    const rows = [
      row({ keyword: "caregiving" }),
      row({ keyword: "respite care", searchVolume: 165000 }),
      row({ keyword: "caregiver", keywordDifficulty: 45 }),
    ];

    const grouped = groupSharedVolumeRows(rows, undefined, true);

    expect(grouped.map((r) => r.keyword)).toEqual([
      "caregiving",
      "caregiver",
      "respite care",
    ]);
    expect(grouped[1]).toEqual({
      ...rows[2],
      parentKeyword: "caregiving",
    });
    expect(grouped[0].parentKeyword).toBeNull();
    expect(grouped[2].parentKeyword).toBeNull();
    const ungrouped = groupSharedVolumeRows(rows, "caregiver", false);
    expect(ungrouped).toEqual(
      rows.map((keyword) => ({ ...keyword, parentKeyword: null })),
    );
  });

  it("leads a group with the searched keyword as typed", () => {
    const rows = [
      row({ keyword: "caregiver" }),
      row({ keyword: "caregiving" }),
    ];

    const [group, child] = groupSharedVolumeRows(rows, " Caregiving", true);

    expect(group.keyword).toBe("caregiving");
    expect(child).toEqual({
      ...rows[0],
      parentKeyword: "caregiving",
    });
  });

  it("keeps rows apart when the shared number is a flat or low-volume bucket", () => {
    const flat = [{ year: 2026, month: 8, searchVolume: 5400 }];
    const rows = [
      row({ keyword: "a", searchVolume: 5400, trend: flat }),
      row({ keyword: "b", searchVolume: 5400, trend: flat }),
      row({ keyword: "c", searchVolume: 90 }),
      row({ keyword: "d", searchVolume: 90 }),
    ];

    expect(groupSharedVolumeRows(rows, undefined, true)).toHaveLength(4);
  });
});
