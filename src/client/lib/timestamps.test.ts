import { describe, expect, it } from "vitest";
import {
  formatTimestampDate,
  formatTimestampIso,
  parseTimestampMs,
} from "./timestamps";

describe("parseTimestampMs", () => {
  it("treats bare SQLite timestamps as UTC", () => {
    expect(parseTimestampMs("2026-07-20 00:30:00")).toBe(
      Date.UTC(2026, 6, 20, 0, 30, 0),
    );
  });

  it("parses ISO UTC strings unchanged", () => {
    expect(parseTimestampMs("2026-07-20T00:30:00.000Z")).toBe(
      Date.UTC(2026, 6, 20, 0, 30, 0),
    );
  });

  it("resolves both formats to the same instant near UTC midnight", () => {
    expect(parseTimestampMs("2026-07-20 00:00:59")).toBe(
      parseTimestampMs("2026-07-20T00:00:59Z"),
    );
  });

  it("respects explicit offsets in ISO strings", () => {
    expect(parseTimestampMs("2026-07-20T02:30:00+02:00")).toBe(
      Date.UTC(2026, 6, 20, 0, 30, 0),
    );
  });

  it("returns NaN for invalid input", () => {
    expect(parseTimestampMs("not a date")).toBeNaN();
  });
});

describe("formatTimestampIso", () => {
  it("normalizes SQLite timestamps to ISO UTC", () => {
    expect(formatTimestampIso("2026-07-20 00:30:00")).toBe(
      "2026-07-20T00:30:00.000Z",
    );
  });

  it("passes ISO strings through as the same instant", () => {
    expect(formatTimestampIso("2026-07-20T00:30:00Z")).toBe(
      "2026-07-20T00:30:00.000Z",
    );
  });

  it("returns the raw value for invalid input", () => {
    expect(formatTimestampIso("not a date")).toBe("not a date");
  });
});

describe("formatTimestampDate", () => {
  it("renders UTC date labels by default so they do not shift with the browser timezone", () => {
    // Adversarial-zone repros from the PR review: before the UTC default,
    // 00:30 rendered as Jul 19 under TZ=America/Los_Angeles and 23:30 as
    // Jul 21 under TZ=Europe/Lisbon. Both must be Jul 20 on any machine.
    expect(
      formatTimestampDate("2026-07-20 00:30:00", "en-US", {
        month: "short",
        day: "numeric",
      }),
    ).toBe("Jul 20");
    expect(
      formatTimestampDate("2026-07-20 23:30:00", "en-US", {
        month: "short",
        day: "numeric",
      }),
    ).toBe("Jul 20");
  });

  it("lets callers override the default UTC time zone", () => {
    expect(
      formatTimestampDate("2026-07-20 00:30:00", "en-US", {
        timeZone: "America/Los_Angeles",
        month: "short",
        day: "numeric",
      }),
    ).toBe("Jul 19");
  });

  it("keeps the UTC calendar date for SQLite timestamps just after midnight", () => {
    expect(
      formatTimestampDate("2026-07-20 00:30:00", "en-US", {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
      }),
    ).toBe("Jul 20");
  });

  it("formats ISO strings for the same instant identically", () => {
    expect(
      formatTimestampDate("2026-07-20T00:30:00Z", "en-US", {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
      }),
    ).toBe("Jul 20");
  });

  it("returns the raw value for invalid input", () => {
    expect(formatTimestampDate("not a date")).toBe("not a date");
  });
});
