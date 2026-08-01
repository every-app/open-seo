import { afterEach, describe, expect, it, vi } from "vitest";
import { computeNextCheckAt, scheduleLabel } from "./rank-tracking";

describe("rank tracking schedules", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("labels monthly schedules", () => {
    expect(scheduleLabel("monthly")).toBe("Monthly");
  });

  it("schedules new monthly configs for the end of the current month", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));
    vi.spyOn(Math, "random").mockReturnValueOnce(0).mockReturnValueOnce(0);

    expect(computeNextCheckAt("monthly")).toBe("2026-01-31T04:00:00.000Z");
  });

  it("moves new monthly configs to next month when this month's run time has passed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-31T10:00:00.000Z"));
    vi.spyOn(Math, "random").mockReturnValueOnce(0).mockReturnValueOnce(0);

    expect(computeNextCheckAt("monthly")).toBe("2026-02-28T04:00:00.000Z");
  });

  it("advances monthly schedules on month end across shorter months", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T00:00:00.000Z"));

    expect(computeNextCheckAt("monthly", "2026-01-31T05:30:00.000Z")).toBe(
      "2026-02-28T05:30:00.000Z",
    );
  });

  it("keeps advancing monthly schedules until the next check is in the future", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-10T00:00:00.000Z"));

    expect(computeNextCheckAt("monthly", "2026-01-31T05:30:00.000Z")).toBe(
      "2026-03-31T05:30:00.000Z",
    );
  });
});
