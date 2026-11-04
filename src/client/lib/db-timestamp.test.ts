import { describe, expect, it } from "vitest";
import { formatExportTimestamp, parseDbTimestamp } from "./db-timestamp";

describe("database timestamps", () => {
  it("reads SQLite and Postgres forms of a time near UTC midnight as the same instant", () => {
    const instant = Date.UTC(2026, 6, 20, 0, 30);

    expect(parseDbTimestamp("2026-07-20 00:30:00").getTime()).toBe(instant);
    expect(parseDbTimestamp("2026-07-20T00:30:00.000Z").getTime()).toBe(
      instant,
    );
    expect(formatExportTimestamp("2026-07-20 00:30:00")).toBe(
      "2026-07-20 00:30",
    );
  });

  it("exports an unreadable timestamp as an empty cell", () => {
    expect(formatExportTimestamp("not a date")).toBe("");
  });
});
