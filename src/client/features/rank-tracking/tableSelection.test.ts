import { describe, expect, it } from "vitest";
import type { MutableRefObject } from "react";
import type { RowSelectionState, Updater } from "@tanstack/react-table";
import {
  applyShiftRangeSelection,
  type SelectionAnchor,
} from "@/client/components/table/tableSelection";

function makeRow(id: string, selectedIds: Set<string>) {
  return {
    id,
    getIsSelected: () => selectedIds.has(id),
    getCanSelect: () => id !== "locked",
  };
}

function makeEvent(shiftKey: boolean) {
  const event = {
    shiftKey,
    defaultPrevented: false,
    preventDefault() {
      event.defaultPrevented = true;
    },
  };

  return event;
}

function makeTable(ids: string[], selectedIds: Set<string>) {
  return {
    getRowModel: () => ({
      rows: ids.map((id) => makeRow(id, selectedIds)),
    }),
    setRowSelection: (updater: Updater<RowSelectionState>) => {
      const currentSelection = Object.fromEntries(
        Array.from(selectedIds).map((id) => [id, true]),
      );
      const nextSelection =
        typeof updater === "function" ? updater(currentSelection) : updater;

      selectedIds.clear();
      Object.entries(nextSelection).forEach(([id, selected]) => {
        if (selected) selectedIds.add(id);
      });
    },
  };
}

describe("applyShiftRangeSelection", () => {
  it("selects the visible range from an anchor set by a plain click", () => {
    const selectedIds = new Set<string>();
    const table = makeTable(["a", "b", "c", "d"], selectedIds);
    const anchorRef: MutableRefObject<SelectionAnchor | null> = {
      current: null,
    };

    const plainClick = makeEvent(false);
    expect(
      applyShiftRangeSelection(
        plainClick,
        makeRow("a", selectedIds),
        table,
        anchorRef,
      ),
    ).toBe(false);
    expect(anchorRef.current).toEqual({ id: "a", selected: true });
    expect(plainClick.defaultPrevented).toBe(false);
    selectedIds.add("a");

    const event = makeEvent(true);

    expect(
      applyShiftRangeSelection(
        event,
        makeRow("c", selectedIds),
        table,
        anchorRef,
      ),
    ).toBe(true);
    expect(Array.from(selectedIds)).toEqual(["a", "b", "c"]);
    expect(anchorRef.current).toEqual({ id: "c", selected: true });
    expect(event.defaultPrevented).toBe(true);
  });

  it("clears the visible range from a deselected anchor", () => {
    const selectedIds = new Set<string>(["a", "b", "c", "d"]);
    const table = makeTable(["a", "b", "c", "d"], selectedIds);
    const anchorRef: MutableRefObject<SelectionAnchor | null> = {
      current: { id: "b", selected: false },
    };

    applyShiftRangeSelection(
      makeEvent(true),
      makeRow("d", selectedIds),
      table,
      anchorRef,
    );

    expect(Array.from(selectedIds)).toEqual(["a"]);
    expect(anchorRef.current).toEqual({ id: "d", selected: false });
  });

  it("skips rows that can't be selected", () => {
    const selectedIds = new Set<string>();
    const table = makeTable(["a", "locked", "c"], selectedIds);
    const anchorRef: MutableRefObject<SelectionAnchor | null> = {
      current: { id: "a", selected: true },
    };

    applyShiftRangeSelection(
      makeEvent(true),
      makeRow("c", selectedIds),
      table,
      anchorRef,
    );

    expect(Array.from(selectedIds)).toEqual(["a", "c"]);
  });
});
