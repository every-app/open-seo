import type { MouseEvent, MutableRefObject } from "react";
import type { Row, Table } from "@tanstack/react-table";

/**
 * Shift-click range selection helper for TanStack Table rows.
 *
 * Pass through every click that toggles row selection. Tracks the last
 * clicked row id in `anchorRef`; on Shift+click, applies the anchor row's
 * current selection state to every row between the anchor and the clicked
 * row (in the table's current sort/filter order).
 *
 * Returns `true` if the event was handled as a range action (caller should
 * skip its default toggle); `false` otherwise (caller should toggle as
 * usual). The anchor is always updated to the most recently clicked row.
 */
export function applyShiftRangeSelection<T>(
  e: MouseEvent<HTMLElement>,
  row: Row<T>,
  table: Table<T>,
  anchorRef: MutableRefObject<string | null>,
): boolean {
  const anchorId = anchorRef.current;

  if (!e.shiftKey || !anchorId || anchorId === row.id) {
    anchorRef.current = row.id;
    return false;
  }

  const rows = table.getRowModel().rows;
  const anchorIdx = rows.findIndex((r) => r.id === anchorId);
  const currentIdx = rows.findIndex((r) => r.id === row.id);

  if (anchorIdx === -1 || currentIdx === -1) {
    anchorRef.current = row.id;
    return false;
  }

  // Prevent default browser toggle (for checkbox clicks) and avoid the
  // caller's own toggle path — we apply selection directly.
  e.preventDefault();

  const [from, to] =
    anchorIdx < currentIdx
      ? [anchorIdx, currentIdx]
      : [currentIdx, anchorIdx];

  // Apply same state as the anchor (last clicked) row, so shift-click can
  // both extend and contract a selection symmetrically.
  const targetState = rows[anchorIdx].getIsSelected();
  for (let i = from; i <= to; i++) {
    rows[i].toggleSelected(targetState);
  }

  anchorRef.current = row.id;
  return true;
}
