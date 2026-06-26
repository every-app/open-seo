import { describe, expect, it, vi, afterEach } from "vitest";
import { computeNextCheckAt, scheduleLabel } from "./rank-tracking";

describe("computeNextCheckAt", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("monthly without anchor advances ~1 month from now", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-03-15T12:00:00Z"));

    const result = new Date(computeNextCheckAt("monthly"));
    // Should be in April 2025
    expect(result.getUTCMonth()).toBe(3); // April = 3
    expect(result.getUTCFullYear()).toBe(2025);
  });

  it("monthly with anchor advances month-by-month until future", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-20T12:00:00Z"));

    const result = new Date(
      computeNextCheckAt("monthly", "2025-05-01T06:30:00.000Z"),
    );
    // Anchor is May 1 → June 1 is still past → July 1
    expect(result.getUTCMonth()).toBe(6); // July = 6
    expect(result.getUTCDate()).toBe(1);
  });

  it("monthly handles end-of-month rollover (Jan 31 → Mar 3)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-02-01T12:00:00Z"));

    const result = new Date(
      computeNextCheckAt("monthly", "2025-01-31T06:00:00.000Z"),
    );
    // JS Date: Jan 31 + 1 month = Mar 3 (Feb has 28 days, overflow)
    // Mar 3 is already in the future relative to Feb 1, so no further advance
    expect(result.getUTCMonth()).toBe(2); // March
    expect(result.getUTCDate()).toBe(3);
  });

  it("daily still works as before", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-03-15T12:00:00Z"));

    const result = new Date(computeNextCheckAt("daily"));
    expect(result.getUTCDate()).toBe(16);
  });

  it("weekly still works as before", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-03-15T12:00:00Z"));

    const result = new Date(computeNextCheckAt("weekly"));
    expect(result.getUTCDate()).toBe(22);
  });
});

describe("scheduleLabel", () => {
  it("returns Monthly for monthly", () => {
    expect(scheduleLabel("monthly")).toBe("Monthly");
  });

  it("returns Daily for daily", () => {
    expect(scheduleLabel("daily")).toBe("Daily");
  });

  it("returns Weekly for weekly", () => {
    expect(scheduleLabel("weekly")).toBe("Weekly");
  });

  it("returns Manual for manual", () => {
    expect(scheduleLabel("manual")).toBe("Manual");
  });
});
