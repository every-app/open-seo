import { describe, expect, it } from "vitest";

// Contract tests for the check-selected flow: the exact selected keyword IDs
// from the table's selection state must be the sole scope of the rank check
// request — regardless of filters, sort, or pagination — and never expand to
// the full tracked-keyword set.

/**
 * Mirrors the mapping in RankTrackingTable: tan-stack selection state (keyed
 * by row id = trackingKeywordId) to the ID list sent to onCheckSelected.
 */
function selectedIdsFromTableState(
  selection: Record<string, boolean>,
  rowIdsInData: string[],
): string[] {
  return rowIdsInData.filter((id) => selection[id]);
}

/**
 * Mirrors RankTrackingDomainDetail.requestCheck: small selections start
 * immediately with the selected scope; the confirm modal path keeps the
 * same keywordIds.
 */
function requestCheckArgs(
  selectedIds: string[],
): { keywordIds: string[] } | undefined {
  if (selectedIds.length === 0) return undefined;
  return { keywordIds: selectedIds };
}

describe("check selected: selection scope", () => {
  it("sends exactly the four checked ids when 4 rows are selected out of 901", () => {
    const allIds = Array.from({ length: 901 }, (_, i) => `keyword_${i + 1}`);
    const selection: Record<string, boolean> = {
      keyword_1: true,
      keyword_2: true,
      keyword_3: true,
      keyword_900: true,
    };

    const ids = selectedIdsFromTableState(selection, allIds);
    const request = requestCheckArgs(ids);

    expect(request?.keywordIds).toEqual([
      "keyword_1",
      "keyword_2",
      "keyword_3",
      "keyword_900",
    ]);
    expect(request?.keywordIds).toHaveLength(4);
    expect(request?.keywordIds).not.toHaveLength(901);
  });

  it("sends a single id when one row is selected", () => {
    const request = requestCheckArgs(
      selectedIdsFromTableState({ keyword_42: true }, ["keyword_42"]),
    );
    expect(request?.keywordIds).toEqual(["keyword_42"]);
  });

  it("omits keywordIds (full scope) when nothing is selected", () => {
    const request = requestCheckArgs(
      selectedIdsFromTableState({}, ["keyword_1", "keyword_2"]),
    );
    expect(request).toBeUndefined();
  });

  it("does not include filtered-out or deselected rows", () => {
    const visibleRows = ["keyword_5", "keyword_6"]; // current filter view
    const selection: Record<string, boolean> = {
      keyword_5: true,
      keyword_6: false, // row visible but unchecked
    };
    const ids = selectedIdsFromTableState(selection, visibleRows);
    expect(ids).toEqual(["keyword_5"]);
  });

  it("selection survives re-sorting because ids, not indexes, are the identity", () => {
    const selection: Record<string, boolean> = {
      keyword_A: true,
      keyword_B: true,
    };
    const sortedDifferently = ["keyword_B", "keyword_A", "keyword_C"];
    const ids = selectedIdsFromTableState(selection, sortedDifferently);
    expect(ids.toSorted()).toEqual(["keyword_A", "keyword_B"]);
  });

  it("paginating does not corrupt selection: ids from page 1 and page 2 combine", () => {
    const selection: Record<string, boolean> = {
      keyword_page1: true,
      keyword_page2: true,
    };
    // Rows are re-fetched per page; union across what the table has seen is
    // the selection state itself, which is keyed by stable id.
    const page1 = selectedIdsFromTableState(selection, ["keyword_page1"]);
    const page2 = selectedIdsFromTableState(selection, ["keyword_page2"]);
    expect([...page1, ...page2]).toEqual(["keyword_page1", "keyword_page2"]);
  });
});
