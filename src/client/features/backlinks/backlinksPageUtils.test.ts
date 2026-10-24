import { describe, expect, it } from "vitest";
import {
  formatCompactDate,
  formatMonthLabel,
  parseDisplayDate,
  truncateMiddle,
} from "./backlinksPageUtils";

describe("truncateMiddle", () => {
  it("never returns a string longer than maxLength", () => {
    const value = "/very/long/path/segment/that/keeps/going/here";
    for (let maxLength = 0; maxLength <= value.length; maxLength++) {
      expect(truncateMiddle(value, maxLength).length).toBeLessThanOrEqual(
        maxLength,
      );
    }
  });

  it("keeps head and tail around a middle ellipsis", () => {
    expect(truncateMiddle("abcdefghijklmno", 10)).toBe("abc...mno");
    expect(truncateMiddle("/very/long/path/segment/here", 12)).toBe(
      "/ver...here",
    );
  });
});

describe("parseDisplayDate", () => {
  it("reads a date-only value as local midnight, not UTC midnight", () => {
    // The assertion that does not depend on where this runs. `new Date("2026-03-01")`
    // is UTC midnight and `new Date(2026, 2, 1)` is local midnight; they are the same
    // instant only in UTC, and everywhere west of it the first renders as the day
    // before. These are calendar dates -- normalizeHistoryDate slices every history
    // date to YYYY-MM-DD -- so local midnight is the one that means March 1st.
    expect(parseDisplayDate("2026-03-01").getTime()).toBe(
      new Date(2026, 2, 1).getTime(),
    );
    expect(parseDisplayDate("2026-03").getTime()).toBe(
      new Date(2026, 2, 1).getTime(),
    );
  });

  it("leaves a value that carries a time to Date", () => {
    const withTime = "2026-03-01T12:00:00Z";
    expect(parseDisplayDate(withTime).getTime()).toBe(
      new Date(withTime).getTime(),
    );
  });
});

describe("formatCompactDate", () => {
  it("shows the calendar date it was given", () => {
    expect(formatCompactDate("2026-03-01")).toBe(
      new Date(2026, 2, 1).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    );
  });

  it("returns a dash for nothing and the value back when it is not a date", () => {
    expect(formatCompactDate(null)).toBe("-");
    expect(formatCompactDate("not a date")).toBe("not a date");
  });
});

describe("formatMonthLabel", () => {
  it("labels the month it was given", () => {
    expect(formatMonthLabel("2026-03-01")).toBe(
      new Date(2026, 2, 1).toLocaleDateString(undefined, {
        month: "short",
        year: "2-digit",
      }),
    );
  });
});
