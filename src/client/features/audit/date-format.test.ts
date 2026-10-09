import { afterEach, describe, expect, it, vi } from "vitest";
import { formatDate, formatStartedAt } from "./date-format";

afterEach(() => vi.unstubAllEnvs());

describe("audit timestamps in the browser timezone", () => {
  it.each([
    ["2026-10-09 07:06:44", "Oct 9, 8:06 AM"],
    ["2026-12-09 07:06:44", "Dec 9, 7:06 AM"],
    ["2026-03-29 00:59:00", "Mar 29, 12:59 AM"],
    ["2026-03-29 01:00:00", "Mar 29, 2:00 AM"],
    ["2026-10-25 00:59:00", "Oct 25, 1:59 AM"],
    ["2026-10-25 01:00:00", "Oct 25, 1:00 AM"],
  ])("converts self-hosted UTC %s to %s", (timestamp, expected) => {
    vi.stubEnv("TZ", "Europe/London");
    expect(formatStartedAt(timestamp)).toBe(expected);
  });

  it.each([
    "2026-10-09T07:06:44.000Z",
    "2026-10-09T08:06:44+01:00",
    "2026-10-09 07:06:44.123",
  ])("preserves the instant in %s", (timestamp) => {
    vi.stubEnv("TZ", "Europe/London");
    expect(formatStartedAt(timestamp)).toBe("Oct 9, 8:06 AM");
  });

  it("uses the local calendar day in audit history across midnight", () => {
    vi.stubEnv("TZ", "Europe/London");
    expect(formatDate("2026-10-08 23:30:00")).toBe("Oct 9, 2026");
    expect(formatDate("2026-10-08T23:30:00.000Z")).toBe("Oct 9, 2026");
  });

  it("uses the browser timezone rather than a fixed UK offset", () => {
    vi.stubEnv("TZ", "America/New_York");
    expect(formatStartedAt("2026-10-09 07:06:44")).toBe("Oct 9, 3:06 AM");
  });
});
