import { describe, expect, it } from "vitest";
import {
  buildClickChanges,
  buildDailyTrend,
  buildStrikingDistanceRows,
  previousClicksLookup,
  previousPeriod,
  sumSearchTotals,
} from "@/server/features/gsc/searchPerformanceReport";

describe("buildDailyTrend", () => {
  it("runs oldest first across the whole range, with zeros and no position for days GSC omits", () => {
    const trend = buildDailyTrend(
      [
        {
          keys: ["2026-10-03"],
          clicks: 7,
          impressions: 90,
          ctr: 0.08,
          position: 4,
        },
        {
          keys: ["2026-10-01"],
          clicks: 2,
          impressions: 40,
          ctr: 0.05,
          position: 6,
        },
      ],
      "2026-10-01",
      "2026-10-03",
    );
    expect(trend).toEqual([
      {
        date: "2026-10-01",
        clicks: 2,
        impressions: 40,
        ctr: 0.05,
        position: 6,
      },
      // A zero position would chart the empty day as the best rank there is.
      { date: "2026-10-02", clicks: 0, impressions: 0, ctr: 0, position: null },
      {
        date: "2026-10-03",
        clicks: 7,
        impressions: 90,
        ctr: 0.08,
        position: 4,
      },
    ]);
  });
});

describe("sumSearchTotals", () => {
  it("sums clicks/impressions and impression-weights position", () => {
    const totals = sumSearchTotals([
      { clicks: 10, impressions: 100, ctr: 0.1, position: 2 },
      { clicks: 5, impressions: 300, ctr: 0.016, position: 10 },
    ]);
    expect(totals.clicks).toBe(15);
    expect(totals.impressions).toBe(400);
    expect(totals.ctr).toBeCloseTo(15 / 400);
    // (2*100 + 10*300) / 400 = 8
    expect(totals.position).toBeCloseTo(8);
  });

  it("returns zeros for no rows instead of NaN", () => {
    expect(sumSearchTotals([])).toEqual({
      clicks: 0,
      impressions: 0,
      ctr: 0,
      position: 0,
    });
  });
});

const row = (query: string, position: number, impressions: number) => ({
  keys: [query, `https://example.com/${query}`],
  clicks: 1,
  impressions,
  ctr: 0.01,
  position,
});

// Same query can map to multiple pages; this lets a test set distinct pages.
const pageRow = (
  query: string,
  page: string,
  position: number,
  impressions: number,
) => ({ keys: [query, page], clicks: 1, impressions, ctr: 0.01, position });

describe("buildStrikingDistanceRows", () => {
  it("keeps positions 5..20 inclusive and sorts by impressions desc", () => {
    const rows = buildStrikingDistanceRows([
      row("top-spot", 2, 900),
      row("low-edge", 5, 10),
      row("close", 6.4, 100),
      row("closer", 11, 400),
      row("high-edge", 20, 20),
      row("page-3", 24, 800),
    ]);
    expect(rows.map((r) => r.query)).toEqual([
      "closer",
      "close",
      "high-edge",
      "low-edge",
    ]);
  });

  it("drops a query whose top page already ranks above the band", () => {
    // openseo: homepage ranks #2, a secondary page ranks #6. The site already
    // ranks near the top, so the query is not a striking-distance opportunity.
    const rows = buildStrikingDistanceRows([
      pageRow("openseo", "https://x.com/home", 2, 900),
      pageRow("openseo", "https://x.com/mcp", 6, 300),
    ]);
    expect(rows).toHaveLength(0);
  });

  it("collapses a query to its best-ranking page when that page is in band", () => {
    const rows = buildStrikingDistanceRows([
      pageRow("kw", "https://x.com/a", 14, 100),
      pageRow("kw", "https://x.com/b", 8, 500),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].page).toBe("https://x.com/b");
    expect(rows[0].position).toBe(8);
  });
});

const keyRow = (key: string, clicks: number, position: number) => ({
  keys: [key],
  clicks,
  impressions: 100,
  ctr: clicks / 100,
  position,
});

describe("buildClickChanges", () => {
  it("ranks gains and losses, counting keys that appear in only one period from zero", () => {
    const { gained, lost } = buildClickChanges(
      [keyRow("steady", 50, 2), keyRow("up", 40, 3), keyRow("new", 30, 8)],
      [keyRow("steady", 49, 2), keyRow("up", 25, 6), keyRow("gone", 20, 5)],
      1000,
    );
    expect(gained).toEqual([
      {
        key: "new",
        clicks: 30,
        prevClicks: 0,
        position: 8,
        prevPosition: null,
      },
      { key: "up", clicks: 40, prevClicks: 25, position: 3, prevPosition: 6 },
      {
        key: "steady",
        clicks: 50,
        prevClicks: 49,
        position: 2,
        prevPosition: 2,
      },
    ]);
    expect(lost).toEqual([
      {
        key: "gone",
        clicks: 0,
        prevClicks: 20,
        position: null,
        prevPosition: 5,
      },
    ]);
  });

  it("leaves a change unknown when the other period's page is full of rows with clicks", () => {
    // GSC returns the top rows by clicks. "new" is missing from a full page
    // whose weakest row had 9 clicks, so it had anywhere from 0 to 9 before.
    const current = [keyRow("a", 50, 2), keyRow("new", 30, 8)];
    const previous = [keyRow("a", 40, 2), keyRow("b", 9, 4)];
    expect(buildClickChanges(current, previous, 2).gained).toEqual([
      expect.objectContaining({ key: "a" }),
    ]);
    const previousClicks = previousClicksLookup(previous, 2);
    expect(previousClicks("a")).toBe(40);
    expect(previousClicks("new")).toBeNull();
    // A full page that reaches down to a zero-click row leaves no doubt.
    const toZero = previousClicksLookup(
      [keyRow("a", 40, 2), keyRow("b", 0, 4)],
      2,
    );
    expect(toZero("new")).toBe(0);
  });
});

describe("previousPeriod", () => {
  it.each([
    ["2026-06-01", "2026-06-28", "2026-05-04", "2026-05-31"],
    ["2026-06-10", "2026-06-10", "2026-06-09", "2026-06-09"],
  ])(
    "returns the same-length window ending the day before %s..%s",
    (startDate, endDate, prevStart, prevEnd) => {
      expect(previousPeriod(startDate, endDate)).toEqual({
        startDate: prevStart,
        endDate: prevEnd,
      });
    },
  );
});
