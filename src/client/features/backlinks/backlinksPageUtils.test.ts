import { describe, expect, it } from "vitest";
import {
  formatCompactDate,
  formatMonthLabel,
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

describe("formatCompactDate", () => {
  // `new Date("2026-03-01")` is UTC midnight, which renders as Feb 28 anywhere
  // west of UTC. Comparing against local midnight fails there.
  it("shows the calendar date it was given", () => {
    expect(formatCompactDate("2026-03-01")).toBe(
      new Date(2026, 2, 1).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    );
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
