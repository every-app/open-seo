import { describe, expect, it } from "vitest";
import {
  buildStrikingDistanceRows,
  currentPeriodTotals,
  previousPeriodTotals,
  sumBingTotals,
  toDailyRows,
  toPageRows,
  toQueryRows,
} from "@/server/features/bing/bingPerformanceReport";

describe("toDailyRows", () => {
  it("parses /Date(ms-offset)/ and sorts ascending", () => {
    const rows = toDailyRows([
      { Date: "/Date(1704153600000-0800)/", Clicks: 5, Impressions: 100 },
      { Date: "/Date(1704067200000+0000)/", Clicks: 3, Impressions: 50 },
    ]);
    expect(rows).toEqual([
      { date: "2024-01-01", clicks: 3, impressions: 50 },
      { date: "2024-01-02", clicks: 5, impressions: 100 },
    ]);
  });

  it("drops rows with an unparseable date instead of throwing", () => {
    const rows = toDailyRows([
      { Date: "not-a-date", Clicks: 1, Impressions: 1 },
      { Date: "/Date(1704067200000)/", Clicks: 2, Impressions: 4 },
    ]);
    expect(rows).toEqual([{ date: "2024-01-01", clicks: 2, impressions: 4 }]);
  });
});

describe("sumBingTotals", () => {
  it("sums clicks/impressions and derives ctr", () => {
    const totals = sumBingTotals([
      { date: "2024-01-01", clicks: 10, impressions: 100 },
      { date: "2024-01-02", clicks: 5, impressions: 100 },
    ]);
    expect(totals).toEqual({ clicks: 15, impressions: 200, ctr: 0.075 });
  });

  it("returns zeros for no rows instead of NaN", () => {
    expect(sumBingTotals([])).toEqual({ clicks: 0, impressions: 0, ctr: 0 });
  });
});

const day = (date: string, clicks: number) => ({
  date,
  clicks,
  impressions: clicks * 10,
});

describe("current/previousPeriodTotals", () => {
  it("splits the fixed window in half: recent half vs. prior half", () => {
    const rows = [
      day("2024-01-01", 1),
      day("2024-01-02", 2),
      day("2024-01-03", 3),
      day("2024-01-04", 4),
    ];
    expect(previousPeriodTotals(rows)).toEqual({
      clicks: 3,
      impressions: 30,
      ctr: 0.1,
    });
    expect(currentPeriodTotals(rows)).toEqual({
      clicks: 7,
      impressions: 70,
      ctr: 0.1,
    });
  });

  it("returns null for previous period with too few days to split", () => {
    expect(previousPeriodTotals([day("2024-01-01", 1)])).toBeNull();
    expect(currentPeriodTotals([day("2024-01-01", 1)])).toEqual({
      clicks: 1,
      impressions: 10,
      ctr: 0.1,
    });
  });
});

describe("toQueryRows / toPageRows", () => {
  it("maps query stats verbatim", () => {
    const rows = toQueryRows([
      {
        Query: "accessibility widget",
        Clicks: 3,
        Impressions: 40,
        AvgClickPosition: 4.2,
        AvgImpressionPosition: 6.2,
        Date: "/Date(1704067200000)/",
      },
    ]);
    expect(rows).toEqual([
      {
        query: "accessibility widget",
        clicks: 3,
        impressions: 40,
        avgClickPosition: 4.2,
        avgImpressionPosition: 6.2,
      },
    ]);
  });

  it("collapses query x page rows to distinct-query counts per page, sorted", () => {
    const rows = toPageRows([
      { Query: "a", Page: "/page-1" },
      { Query: "b", Page: "/page-1" },
      { Query: "c", Page: "/page-2" },
    ]);
    expect(rows).toEqual([
      { page: "/page-1", queryCount: 2 },
      { page: "/page-2", queryCount: 1 },
    ]);
  });
});

const strikingQuery = (
  name: string,
  avgImpressionPosition: number,
  impressions: number,
) => ({
  Query: name,
  Clicks: 1,
  Impressions: impressions,
  AvgClickPosition: avgImpressionPosition,
  AvgImpressionPosition: avgImpressionPosition,
  Date: "/Date(1704067200000)/",
});

describe("buildStrikingDistanceRows", () => {
  it("keeps only the 5..20 band, sorted by impressions desc", () => {
    const rows = buildStrikingDistanceRows([
      strikingQuery("too-high", 2, 1000),
      strikingQuery("in-band-low-impressions", 6, 50),
      strikingQuery("in-band-high-impressions", 12, 500),
      strikingQuery("too-low", 30, 999),
    ]);
    expect(rows.map((r) => r.query)).toEqual([
      "in-band-high-impressions",
      "in-band-low-impressions",
    ]);
  });

  it("returns 0 rows on a real known-in-band case, not silently", () => {
    // Regression guard for the "0 rows exercises nothing" trap: assert the
    // fixture actually produces a non-empty result before trusting the
    // empty-input case below.
    const positive = buildStrikingDistanceRows([strikingQuery("q", 10, 100)]);
    expect(positive).toHaveLength(1);

    expect(buildStrikingDistanceRows([])).toEqual([]);
  });
});
