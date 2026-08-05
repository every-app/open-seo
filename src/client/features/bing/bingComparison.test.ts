import { describe, expect, it } from "vitest";
import { last28DayReport, percentDelta } from "./bingComparison";

function day(date: string, clicks: number, impressions: number) {
  return { date: `${date}T00:00:00.000Z`, clicks, impressions };
}

/** `count` consecutive days ending at `end` (inclusive), constant volume. */
function series(
  end: string,
  count: number,
  clicks: number,
  impressions: number,
) {
  const endMs = Date.parse(`${end}T00:00:00.000Z`);
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(endMs - (count - 1 - i) * 24 * 60 * 60 * 1000);
    return {
      date: date.toISOString(),
      clicks,
      impressions,
    };
  });
}

describe("last28DayReport", () => {
  it("totals the latest 28 days against the prior 28", () => {
    const rows = [
      ...series("2026-07-06", 28, 1, 10), // prior window
      ...series("2026-08-03", 28, 2, 20), // current window
    ];
    const result = last28DayReport(rows);
    expect(result?.current).toEqual({
      clicks: 56,
      impressions: 560,
      ctr: 0.1,
      startDate: "2026-07-07",
      endDate: "2026-08-03",
    });
    expect(result?.previous).toEqual({
      clicks: 28,
      impressions: 280,
      ctr: 0.1,
      startDate: "2026-06-09",
      endDate: "2026-07-06",
    });
  });

  it("excludes days older than the prior window from both totals", () => {
    const rows = [
      ...series("2026-06-08", 30, 100, 1000), // older than both windows
      ...series("2026-07-06", 28, 1, 10),
      ...series("2026-08-03", 28, 2, 20),
    ];
    const result = last28DayReport(rows);
    expect(result?.current.clicks).toBe(56);
    expect(result?.previous?.clicks).toBe(28);
  });

  it("omits the delta when the data doesn't span the full prior window", () => {
    // 40 days of data: the current 28 are covered but the prior 28 aren't.
    const result = last28DayReport(series("2026-08-03", 40, 1, 10));
    expect(result?.current.clicks).toBe(28);
    expect(result?.previous).toBeNull();
  });

  it("keeps the delta at exactly 56 days of coverage", () => {
    const result = last28DayReport(series("2026-08-03", 56, 1, 10));
    expect(result?.current.clicks).toBe(28);
    expect(result?.previous?.clicks).toBe(28);
  });

  it("sorts unordered input and ignores null dates", () => {
    const rows = [
      ...series("2026-08-03", 56, 1, 10),
      { date: null, clicks: 999, impressions: 9999 },
    ].toReversed();
    const result = last28DayReport(rows);
    expect(result?.current.clicks).toBe(28);
    expect(result?.previous?.clicks).toBe(28);
  });

  it("absorbs the DST hour shift when assigning days to windows", () => {
    // US DST ends Nov 1 2026: Bing's midnight-Pacific buckets jump from
    // 07:00Z to 08:00Z mid-series. Day windows must not drift.
    const before = series("2026-10-31", 40, 1, 10).map((row) => ({
      ...row,
      date: row.date.replace("T00:00:00.000Z", "T07:00:00.000Z"),
    }));
    const after = series("2026-11-16", 16, 2, 20).map((row) => ({
      ...row,
      date: row.date.replace("T00:00:00.000Z", "T08:00:00.000Z"),
    }));
    const result = last28DayReport([...before, ...after]);
    // Current window: 16 after-days (32 clicks) + 12 before-days (12 clicks).
    expect(result?.current.clicks).toBe(44);
    expect(result?.previous?.clicks).toBe(28);
  });

  it("returns null with no dated rows", () => {
    expect(last28DayReport([])).toBeNull();
    expect(
      last28DayReport([{ date: null, clicks: 1, impressions: 10 }]),
    ).toBeNull();
  });

  it("reports a zero-volume current window without inventing a delta", () => {
    const result = last28DayReport([day("2026-08-03", 0, 0)]);
    expect(result?.current.clicks).toBe(0);
    expect(result?.current.ctr).toBe(0);
    expect(result?.previous).toBeNull();
  });
});

describe("percentDelta", () => {
  it("formats signed percent change", () => {
    expect(percentDelta(110, 100)).toEqual({ text: "+10.0%", improved: true });
    expect(percentDelta(90, 100)).toEqual({ text: "-10.0%", improved: false });
  });

  it("returns null when the previous value is not positive", () => {
    expect(percentDelta(10, 0)).toBeNull();
  });
});
