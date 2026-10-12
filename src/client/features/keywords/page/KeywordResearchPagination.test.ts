import { expect, it } from "vitest";
import type { KeywordResearchDisplayRow } from "../groupSharedVolumeRows";
import { keywordResearchPageEnds } from "./KeywordResearchPagination";

function row(
  keyword: string,
  parentKeyword: string | null = null,
): KeywordResearchDisplayRow {
  return {
    keyword,
    parentKeyword,
    searchVolume: null,
    cpc: null,
    competition: null,
    keywordDifficulty: null,
    intent: "unknown",
    trend: [],
  };
}

it("keeps the boundary parent and all its children on the same page", () => {
  const rows = [
    ...Array.from({ length: 49 }, (_, index) => row(String(index))),
    row("parent"),
    row("child1", "parent"),
    row("child2", "parent"),
    ...Array.from({ length: 50 }, (_, index) => row(`next${index}`)),
  ];
  const ends = keywordResearchPageEnds(rows, 50);
  expect(ends).toEqual([52, 102]);
  const pages = ends.map((end, index) => rows.slice(ends[index - 1] ?? 0, end));
  expect(pages.flat()).toEqual(rows);
  expect(pages.every((page) => page[0].parentKeyword === null)).toBe(true);
});

it("allows an oversized family and retains ordinary boundaries with grouping off", () => {
  const rows = [
    row("parent"),
    row("one", "parent"),
    row("two", "parent"),
    row("next"),
  ];
  expect(keywordResearchPageEnds(rows, 2)).toEqual([3, 4]);
  expect(
    keywordResearchPageEnds(
      rows.map((item) => ({ ...item, parentKeyword: null })),
      2,
    ),
  ).toEqual([2, 4]);
  expect(keywordResearchPageEnds([], 50)).toEqual([]);
});
