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
});

describe("formatMcpTable", () => {
  it("renders a header line plus one line per row", () => {
    type Row = { keyword: string; volume: number | null };
    const table = formatMcpTable(
      [
        { keyword: "seo tools", volume: 2400 },
        { keyword: "seo audit", volume: null },
      ],
      [
        { header: "keyword", value: (row: Row) => row.keyword },
        { header: "volume", value: (row: Row) => row.volume },
      ],
    );
    expect(table).toBe(
      ["keyword | volume", "seo tools | 2400", "seo audit | —"].join("\n"),
    );
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
