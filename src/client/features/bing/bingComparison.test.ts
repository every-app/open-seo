import { describe, expect, it } from "vitest";
import { percentDelta, splitDailySeries } from "./bingComparison";

function day(date: string, clicks: number, impressions: number) {
  return { date: `${date}T00:00:00.000Z`, clicks, impressions };
}

describe("splitDailySeries", () => {
  it("splits the latest half against the preceding equal-length half", () => {
    const result = splitDailySeries([
      day("2026-07-01", 1, 10),
      day("2026-07-02", 2, 20),
      day("2026-07-03", 3, 30),
      day("2026-07-04", 4, 40),
    ]);
    expect(result).toEqual({
      previous: {
        clicks: 3,
        impressions: 30,
        ctr: 0.1,
        startDate: "2026-07-01",
        endDate: "2026-07-02",
      },
      current: {
        clicks: 7,
        impressions: 70,
        ctr: 0.1,
        startDate: "2026-07-03",
        endDate: "2026-07-04",
      },
    });
  });

  it("drops the oldest row on odd counts so halves stay equal", () => {
    const result = splitDailySeries([
      day("2026-07-01", 100, 1000),
      day("2026-07-02", 1, 10),
      day("2026-07-03", 2, 20),
      day("2026-07-04", 3, 30),
      day("2026-07-05", 4, 40),
    ]);
    expect(result?.previous.startDate).toBe("2026-07-02");
    expect(result?.previous.clicks).toBe(3);
    expect(result?.current.clicks).toBe(7);
  });

  it("sorts unordered input and ignores null dates", () => {
    const result = splitDailySeries([
      day("2026-07-04", 4, 40),
      { date: null, clicks: 999, impressions: 9999 },
      day("2026-07-01", 1, 10),
      day("2026-07-03", 3, 30),
      day("2026-07-02", 2, 20),
    ]);
    expect(result?.current.clicks).toBe(7);
    expect(result?.previous.clicks).toBe(3);
  });

  it("returns null with fewer than 4 dated rows", () => {
    expect(
      splitDailySeries([
        day("2026-07-01", 1, 10),
        day("2026-07-02", 2, 20),
        day("2026-07-03", 3, 30),
      ]),
    ).toBeNull();
    expect(splitDailySeries([])).toBeNull();
  });

  it("reports 0 ctr for an impression-less half", () => {
    const result = splitDailySeries([
      day("2026-07-01", 0, 0),
      day("2026-07-02", 0, 0),
      day("2026-07-03", 1, 10),
      day("2026-07-04", 1, 10),
    ]);
    expect(result?.previous.ctr).toBe(0);
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
