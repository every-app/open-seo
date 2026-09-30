import {
  createTable,
  getCoreRowModel,
  getSortedRowModel,
  type ColumnDef,
} from "@tanstack/react-table";
import { describe, expect, it } from "vitest";
import {
  numericNullsLast,
  stringNullsLast,
} from "@/client/components/table/nullSafeSort";

type TestRow = { id: string; score: number | null; title: string | null };

const columns: ColumnDef<TestRow>[] = [
  { id: "score", accessorKey: "score", sortingFn: numericNullsLast },
  { id: "title", accessorKey: "title", sortingFn: stringNullsLast },
];

/**
 * Sort through a real table instance rather than calling the comparators
 * directly: TanStack negates a comparator's result on a descending column, and
 * surviving that flip is the whole point of these helpers.
 */
function sortedIds(
  rows: TestRow[],
  columnId: "score" | "title",
  desc: boolean,
): string[] {
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

describe("numericNullsLast", () => {
  const rows: TestRow[] = [
    { id: "mid", score: 5, title: "beta" },
    { id: "blank", score: null, title: null },
    { id: "high", score: 10, title: "alpha" },
  ];

  it("orders ascending with nulls last", () => {
    expect(sortedIds(rows, "score", false)).toEqual(["mid", "high", "blank"]);
  });

  it("keeps nulls last when descending", () => {
    expect(sortedIds(rows, "score", true)).toEqual(["high", "mid", "blank"]);
  });

  it("treats 0 as a value, not as blank", () => {
    const withZero: TestRow[] = [
      { id: "zero", score: 0, title: "a" },
      { id: "blank", score: null, title: null },
      { id: "one", score: 1, title: "b" },
    ];
    expect(sortedIds(withZero, "score", true)).toEqual([
      "one",
      "zero",
      "blank",
    ]);
  });

  it("leaves multiple blanks in their original order in both directions", () => {
    const manyBlanks: TestRow[] = [
      { id: "blank-1", score: null, title: null },
      { id: "scored", score: 3, title: "a" },
      { id: "blank-2", score: null, title: null },
    ];
    const expected = ["scored", "blank-1", "blank-2"];
    expect(sortedIds(manyBlanks, "score", false)).toEqual(expected);
    expect(sortedIds(manyBlanks, "score", true)).toEqual(expected);
  });
});

describe("stringNullsLast", () => {
  const rows: TestRow[] = [
    { id: "beta", score: 1, title: "beta" },
    { id: "blank", score: null, title: null },
    { id: "alpha", score: 2, title: "alpha" },
  ];

  it("orders ascending with blanks last", () => {
    expect(sortedIds(rows, "title", false)).toEqual(["alpha", "beta", "blank"]);
  });

  it("keeps blanks last when descending", () => {
    expect(sortedIds(rows, "title", true)).toEqual(["beta", "alpha", "blank"]);
  });

  it("counts an empty string as blank", () => {
    const withEmpty: TestRow[] = [
      { id: "empty", score: 1, title: "" },
      { id: "named", score: 2, title: "alpha" },
    ];
    expect(sortedIds(withEmpty, "title", false)).toEqual(["named", "empty"]);
    expect(sortedIds(withEmpty, "title", true)).toEqual(["named", "empty"]);
  });
});
