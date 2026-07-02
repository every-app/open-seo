import { describe, expect, it } from "vitest";
import { formatMcpCell, formatMcpTable, readPath } from "./table";

describe("formatMcpCell", () => {
  it("renders nullish and empty values as an em dash", () => {
    expect(formatMcpCell(null)).toBe("—");
    expect(formatMcpCell(undefined)).toBe("—");
    expect(formatMcpCell("")).toBe("—");
  });

  it("keeps integers exact and gives other numbers two decimals", () => {
    expect(formatMcpCell(0)).toBe("0");
    expect(formatMcpCell(2400)).toBe("2400");
    expect(formatMcpCell(1.5)).toBe("1.50");
    expect(formatMcpCell(0.333333)).toBe("0.33");
  });

  it("renders non-finite numbers as an em dash", () => {
    expect(formatMcpCell(Number.NaN)).toBe("—");
    expect(formatMcpCell(Number.POSITIVE_INFINITY)).toBe("—");
  });

  it("renders booleans and bigints", () => {
    expect(formatMcpCell(true)).toBe("yes");
    expect(formatMcpCell(false)).toBe("no");
    expect(formatMcpCell(10n)).toBe("10");
  });

  it("collapses whitespace so a stray newline can't break the table", () => {
    expect(formatMcpCell("multi\nline   value")).toBe("multi line value");
  });

  it("emits compact JSON for objects instead of [object Object]", () => {
    expect(formatMcpCell({ a: 1 })).toBe('{"a":1}');
    expect(formatMcpCell([1, 2])).toBe("[1,2]");
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

  it("renders only the header when there are no rows", () => {
    expect(formatMcpTable([], columns)).toBe("keyword | volume");
  });

  it("uses a per-column format override when provided", () => {
    const table = formatMcpTable(
      [{ keyword: "x", volume: 0.04 }],
      [
        { header: "keyword", value: (row: Row) => row.keyword },
        {
          header: "CTR",
          value: (row: Row) => row.volume,
          format: (value) =>
            typeof value === "number" ? `${(value * 100).toFixed(1)}%` : "—",
        },
      ],
    );
    expect(table).toBe(["keyword | CTR", "x | 4.0%"].join("\n"));
  });
});

describe("readPath", () => {
  it("walks nested records", () => {
    expect(readPath({ a: { b: { c: 3 } } }, "a", "b", "c")).toBe(3);
  });

  it("returns undefined when a hop is missing or not an object", () => {
    expect(readPath({ a: null }, "a", "b")).toBeUndefined();
    expect(readPath({ a: 1 }, "a", "b")).toBeUndefined();
    expect(readPath(null, "a")).toBeUndefined();
    expect(readPath(undefined, "a")).toBeUndefined();
  });

  it("reads a top-level key", () => {
    expect(readPath({ keyword: "seo" }, "keyword")).toBe("seo");
  });
});
