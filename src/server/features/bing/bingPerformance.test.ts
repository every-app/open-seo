import { describe, expect, it } from "vitest";
import {
  aggregateBingRows,
  bingCoverage,
  bingSiteSummary,
  buildBingPerformanceRows,
} from "./bingPerformance";

const day = (
  key: string,
  date: string,
  clicks: number,
  impressions: number,
  position?: number,
) => ({
  key,
  date,
  clicks,
  impressions,
  ...(position === undefined ? {} : { position }),
});

describe("aggregateBingRows", () => {
  it("sums clicks and impressions per key and derives CTR", () => {
    const rows = aggregateBingRows([
      day("seo", "2024-05-01", 2, 100),
      day("seo", "2024-05-02", 3, 300),
      day("audit", "2024-05-01", 1, 50),
    ]);

    const seo = rows.find((row) => row.key === "seo");
    expect(seo).toMatchObject({ clicks: 5, impressions: 400, ctr: 0.0125 });
    expect(rows.find((row) => row.key === "audit")).toMatchObject({
      clicks: 1,
      impressions: 50,
      ctr: 0.02,
    });
  });

  it("weights average position by impressions and omits it when absent", () => {
    const rows = aggregateBingRows([
      day("seo", "2024-05-01", 1, 100, 4),
      day("seo", "2024-05-02", 1, 300, 8),
      day("nopos", "2024-05-01", 1, 10),
    ]);

    // (4*100 + 8*300) / 400 = 7
    expect(rows.find((row) => row.key === "seo")?.position).toBe(7);
    expect(rows.find((row) => row.key === "nopos")).not.toHaveProperty(
      "position",
    );
  });
});

describe("buildBingPerformanceRows", () => {
  const rows = [
    day("a", "2024-05-01", 10, 1000, 2),
    day("b", "2024-05-01", 5, 100, 6),
    day("c", "2024-05-01", 1, 10, 15),
  ];

  it("filters by impressions and position", () => {
    const out = buildBingPerformanceRows(rows, {
      minImpressions: 100,
      maxPosition: 10,
    });
    expect(out.map((row) => row.key)).toEqual(["a", "b"]);
  });

  it("sorts by the requested metric and caps at rowLimit", () => {
    expect(
      buildBingPerformanceRows(rows, { sortBy: "position" }).map((r) => r.key),
    ).toEqual(["a", "b", "c"]);
    expect(
      buildBingPerformanceRows(rows, { sortBy: "clicks", rowLimit: 1 }).map(
        (r) => r.key,
      ),
    ).toEqual(["a"]);
  });
});

describe("date grouping, totals, and coverage", () => {
  const rows = [
    day("seo", "2024-05-01", 2, 100, 4),
    day("audit", "2024-05-01", 1, 50, 6),
    day("seo", "2024-05-02", 3, 300, 8),
  ];

  it("groups by day when groupBy is date", () => {
    const out = aggregateBingRows(rows, "date");
    expect(out.map((row) => row.key)).toEqual(["2024-05-01", "2024-05-02"]);
    expect(out[0]).toMatchObject({ clicks: 3, impressions: 150 });
    expect(out[1]).toMatchObject({ clicks: 3, impressions: 300 });
  });

  it("takes clicks and impressions from the site-traffic rows, position from the queries", () => {
    const traffic = [
      { date: "2024-05-01", clicks: 2, impressions: 100 },
      { date: "2024-05-02", clicks: 4, impressions: 400 },
    ];
    // The traffic totals differ from the query rows on purpose: Bing's query
    // report is a top-N subset, so its sum is not the site total.
    expect(bingSiteSummary(traffic, rows)).toMatchObject({
      clicks: 6,
      impressions: 500,
    });
    expect(bingSiteSummary([], rows)).toBeNull();
  });

  it("reports the covered days and UTC time zone", () => {
    expect(bingCoverage(rows)).toEqual({
      startDate: "2024-05-01",
      endDate: "2024-05-02",
      days: 2,
      timeZone: "UTC",
    });
  });

  it("sorts a date series chronologically by default", () => {
    const out = buildBingPerformanceRows(rows, { groupBy: "date" });
    expect(out.map((row) => row.key)).toEqual(["2024-05-01", "2024-05-02"]);
  });
});
