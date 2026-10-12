import { afterEach, describe, expect, it, vi } from "vitest";
import { computeNextCheckAt, estimateRankCheckCredits } from "./rank-tracking";

describe("rank tracking cost estimates", () => {
  it.each([
    {
      method: "live" as const,
      keywordCount: 4,
      devices: "desktop" as const,
      depth: 10,
      costUsd: 0.01024,
      costCredits: 12,
    },
    {
      method: "live" as const,
      keywordCount: 1000,
      devices: "both" as const,
      depth: 40,
      costUsd: 16.64,
      costCredits: 18_000,
    },
    {
      method: "queued" as const,
      keywordCount: 104,
      devices: "desktop" as const,
      depth: 10,
      costUsd: 0.07987,
      costCredits: 81,
    },
    {
      method: "queued" as const,
      keywordCount: 1000,
      devices: "both" as const,
      depth: 40,
      costUsd: 4.992,
      costCredits: 5_000,
    },
  ])(
    "matches per-call billing for $method checks",
    ({ keywordCount, devices, depth, method, costUsd, costCredits }) => {
      expect(
        estimateRankCheckCredits(
          Array.from({ length: keywordCount }, (_, i) => `kw ${i}`),
          devices,
          depth,
          method,
        ),
      ).toEqual({ costUsd, costCredits });
    },
  );
});

describe("rank tracking schedules", () => {
  afterEach(() => {
    vi.useRealTimers();
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

  it("advances monthly schedules on month end until the next check is in the future", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T00:00:00.000Z"));
    expect(computeNextCheckAt("monthly", "2026-01-31T05:30:00.000Z")).toBe(
      "2026-02-28T05:30:00.000Z",
    );

    vi.setSystemTime(new Date("2026-03-10T00:00:00.000Z"));
    expect(computeNextCheckAt("monthly", "2026-01-31T05:30:00.000Z")).toBe(
      "2026-03-31T05:30:00.000Z",
    );
  });

  // 2026-01-31 is a Saturday; every weekly advance lands on a Saturday.
  it.each([
    ["daily", "2026-03-11T05:30:00.000Z"],
    ["weekly", "2026-03-14T05:30:00.000Z"],
  ] as const)(
    "preserves the time anchor for heavily overdue %s schedules",
    (frequency, expected) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-03-10T12:00:00.000Z"));

      expect(computeNextCheckAt(frequency, "2026-01-31T05:30:00.000Z")).toBe(
        expected,
      );
    },
  );

  it("starts a chosen time on its next occurrence", () => {
    vi.useFakeTimers();
    // A Tuesday.
    vi.setSystemTime(new Date("2026-03-10T12:00:00.000Z"));
    const sunday9pm = { weekday: 0, hour: 21, minute: 0 };
    const tuesday9am = { weekday: 2, hour: 9, minute: 0 };

    expect(computeNextCheckAt("weekly", null, sunday9pm)).toBe(
      "2026-03-15T21:00:00.000Z",
    );
    // Today's weekday but already past: a week out, not a run in the past.
    expect(computeNextCheckAt("weekly", null, tuesday9am)).toBe(
      "2026-03-17T09:00:00.000Z",
    );
    // A daily time still ahead runs later today.
    expect(computeNextCheckAt("daily", null, { hour: 21, minute: 15 })).toBe(
      "2026-03-10T21:15:00.000Z",
    );
  });

  it("converts a time chosen in a timezone, weekday included", () => {
    vi.useFakeTimers();
    // Late in the minute: the seconds must not leak into the offset.
    vi.setSystemTime(new Date("2026-03-10T12:00:45.000Z"));
    const sunday9pm = { weekday: 0, hour: 21, minute: 0 };

    // UTC-4 in March: Sunday 9 PM is Monday 01:00 UTC.
    expect(
      computeNextCheckAt("weekly", null, {
        ...sunday9pm,
        timeZone: "America/New_York",
      }),
    ).toBe("2026-03-16T01:00:00.000Z");
    // UTC+5:30: Sunday 9 PM is still Sunday in UTC.
    expect(
      computeNextCheckAt("weekly", null, {
        ...sunday9pm,
        timeZone: "Asia/Kolkata",
      }),
    ).toBe("2026-03-15T15:30:00.000Z");
  });

  it("keeps monthly on the user's last day when it is another UTC date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-10T12:00:00.000Z"));
    // Feb 28, 9 PM in Los Angeles (UTC-8) is already March 1 in UTC.
    const losAngeles = computeNextCheckAt("monthly", null, {
      hour: 21,
      minute: 0,
      timeZone: "America/Los_Angeles",
    });
    expect(losAngeles).toBe("2026-03-01T05:00:00.000Z");
    // Feb 28, 1 AM in Kolkata (UTC+5:30) is still February 27 in UTC.
    const kolkata = computeNextCheckAt("monthly", null, {
      hour: 1,
      minute: 0,
      timeZone: "Asia/Kolkata",
    });
    expect(kolkata).toBe("2026-02-27T19:30:00.000Z");

    // Advancing keeps each anchor's relation to the month end.
    vi.setSystemTime(new Date("2026-03-02T12:00:00.000Z"));
    expect(computeNextCheckAt("monthly", losAngeles)).toBe(
      "2026-04-01T05:00:00.000Z",
    );
    expect(computeNextCheckAt("monthly", kolkata)).toBe(
      "2026-03-30T19:30:00.000Z",
    );
  });
});
