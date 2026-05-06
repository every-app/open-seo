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
  it("records the next selected state on a plain click", () => {
    const selectedIds = new Set<string>();
    const table = makeTable(["a", "b"], selectedIds);
    const anchorRef: MutableRefObject<SelectionAnchor | null> = {
      current: null,
    };
    const event = makeEvent(false);

    expect(
      applyShiftRangeSelection(
        event,
        makeRow("a", selectedIds),
        table,
        anchorRef,
      ),
    ).toBe(false);
    expect(anchorRef.current).toEqual({ id: "a", selected: true });
    expect(event.defaultPrevented).toBe(false);
  });

  it("selects the visible range from a selected anchor", () => {
    const selectedIds = new Set<string>(["a"]);
    const table = makeTable(["a", "b", "c", "d"], selectedIds);
    const anchorRef: MutableRefObject<SelectionAnchor | null> = {
      current: { id: "a", selected: true },
    };
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
});
