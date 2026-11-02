import {
  createTable,
  getCoreRowModel,
  getSortedRowModel,
  type ColumnDef,
} from "@tanstack/react-table";
import { describe, expect, it } from "vitest";
import { numericNullsLast, stringNullsLast } from "./nullSafeSort";

type TestRow = { id: string; score: number | null; title: string | null };

const rows: TestRow[] = [
  { id: "mid", score: 5, title: "beta" },
  { id: "blank", score: null, title: "" },
  { id: "high", score: 10, title: "alpha" },
];

// Sort through a real table: TanStack negates a comparator's result on a
// descending column, and surviving that flip is the point of these helpers.
function sortedIds(columnId: "score" | "title", desc: boolean): string[] {
  const columns: ColumnDef<TestRow>[] = [
    { id: "score", accessorKey: "score", sortingFn: numericNullsLast },
    { id: "title", accessorKey: "title", sortingFn: stringNullsLast },
  ];
  const table = createTable<TestRow>({
    data: rows,
    columns,
    state: { sorting: [{ id: columnId, desc }] },
    onStateChange: () => {},
    renderFallbackValue: null,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  return table.getSortedRowModel().rows.map((row) => row.original.id);
}

describe("null-safe sorting", () => {
  it.each([
    ["score", false, ["mid", "high", "blank"]],
    ["score", true, ["high", "mid", "blank"]],
    ["title", false, ["high", "mid", "blank"]],
    ["title", true, ["mid", "high", "blank"]],
  ] as const)("sorts %s (desc=%s) with blanks last", (column, desc, ids) => {
    expect(sortedIds(column, desc)).toEqual(ids);
  });
});
