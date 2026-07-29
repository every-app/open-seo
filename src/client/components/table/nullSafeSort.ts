import type { Row } from "@tanstack/react-table";

/**
 * Null/undefined-aware sorting functions that keep blank rows at the bottom
 * regardless of direction. TanStack's built-in `sortUndefined: "last"` only
 * inspects `undefined`, so a column backed by a nullable DB value falls through
 * to its `sortingFn` — whose result is then negated on a descending sort. These
 * helpers read the column's sort direction from the cell context and return a
 * value that survives the flip.
 */

function isDescending<TData>(row: Row<TData>, columnId: string): boolean {
  const cell = row.getAllCells().find((c) => c.column.id === columnId);
  return cell?.column.getIsSorted() === "desc";
}

/**
 * Sort value for a pair where exactly one side is blank, pre-compensated for
 * the `* -1` TanStack applies to comparator results on a descending column.
 */
function blankLast(aIsBlank: boolean, descending: boolean): number {
  return (aIsBlank ? 1 : -1) * (descending ? -1 : 1);
}

/**
 * Compare two nullable numeric values with nulls always at the bottom,
 * regardless of the column's current sort direction.
 */
function compareNumericNullsLast(
  a: number | null | undefined,
  b: number | null | undefined,
  descending: boolean,
): number {
  if (a == null && b == null) return 0;
  if (a == null || b == null) return blankLast(a == null, descending);
  return a - b;
}

/**
 * Compare two nullable strings with blanks always at the bottom, regardless of
 * the column's current sort direction. Empty strings count as blank — a crawled
 * page can carry `""` for a tag that is present but empty.
 */
function compareStringNullsLast(
  a: string | null | undefined,
  b: string | null | undefined,
  descending: boolean,
): number {
  if (!a && !b) return 0;
  if (!a || !b) return blankLast(!a, descending);
  return a.localeCompare(b);
}

export function numericNullsLast<TData>(
  rowA: Row<TData>,
  rowB: Row<TData>,
  columnId: string,
): number {
  return compareNumericNullsLast(
    rowA.getValue<number | null | undefined>(columnId),
    rowB.getValue<number | null | undefined>(columnId),
    isDescending(rowA, columnId),
  );
}

export function stringNullsLast<TData>(
  rowA: Row<TData>,
  rowB: Row<TData>,
  columnId: string,
): number {
  return compareStringNullsLast(
    rowA.getValue<string | null | undefined>(columnId),
    rowB.getValue<string | null | undefined>(columnId),
    isDescending(rowA, columnId),
  );
}
