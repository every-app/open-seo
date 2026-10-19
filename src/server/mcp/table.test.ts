import { describe, expect, it } from "vitest";
import { formatMcpCell, formatMcpTable, readPath } from "./table";

describe("formatMcpCell", () => {
  it.each([
    [null, "—"],
    [undefined, "—"],
    ["", "—"],
    [Number.NaN, "—"],
    [Number.POSITIVE_INFINITY, "—"],
    [0, "0"],
    [2400, "2400"],
    [1.5, "1.50"],
    [0.333333, "0.33"],
    ["multi\nline   value", "multi line value"],
    [{ a: 1 }, '{"a":1}'],
    [[1, 2], "[1,2]"],
  ])("renders %j as %j", (input, expected) => {
    expect(formatMcpCell(input)).toBe(expected);
  });

  it("swaps pipes so provider prose can't split a cell across columns", () => {
    expect(formatMcpCell("Best Accounting Software | QuickBooks")).toBe(
      "Best Accounting Software ¦ QuickBooks",
    );
  });
});

describe("formatMcpTable", () => {
  type Row = { keyword: string; volume: number | null };
  const columns = [
    { header: "keyword", value: (row: Row) => row.keyword },
    { header: "volume", value: (row: Row) => row.volume },
  ];

  it("renders a header line plus one line per row", () => {
    const table = formatMcpTable(
      [
        { keyword: "seo tools", volume: 2400 },
        { keyword: "seo audit", volume: null },
      ],
      columns,
    );
    expect(table).toBe(
      ["keyword | volume", "seo tools | 2400", "seo audit | —"].join("\n"),
    );
  });

  it("stops at the character budget and says how many rows it dropped", () => {
    const rows = Array.from({ length: 2000 }, (_, index) => ({
      keyword: `keyword ${index} ${"x".repeat(80)}`,
      volume: index,
    }));
    const table = formatMcpTable(rows, columns);
    const lines = table.split("\n");

    // Header line and truncation line bracket the rows that did render.
    const rendered = lines.length - 2;
    expect(table.length).toBeLessThan(45_000);
    expect(lines.at(-1)).toBe(
      `…${rows.length - rendered} more rows are in structuredContent; this table preview is truncated. A narrower request is a new call and, on credit-charging tools, a new charge.`,
    );
  });

  it("honours a caller-supplied budget so multi-table tools can split it", () => {
    const rows = [
      { keyword: "a", volume: 1 },
      { keyword: "b", volume: 2 },
      { keyword: "c", volume: 3 },
    ];
    const lines = formatMcpTable(rows, columns, 24).split("\n");

    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe("a | 1");
    expect(lines[2]).toContain("…2 more rows");
  });
});

describe("readPath", () => {
  it("walks nested records and returns undefined when a hop is missing or not an object", () => {
    expect(readPath({ a: { b: { c: 3 } } }, "a", "b", "c")).toBe(3);
    expect(readPath({ a: null }, "a", "b")).toBeUndefined();
    expect(readPath({ a: 1 }, "a", "b")).toBeUndefined();
    expect(readPath(null, "a")).toBeUndefined();
    expect(readPath(undefined, "a")).toBeUndefined();
  });
});
