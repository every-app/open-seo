import { describe, expect, it } from "vitest";
import {
  buildStrikingDistanceRows,
  previousPeriod,
  sumSearchTotals,
  toDimensionRows,
} from "@/server/features/gsc/searchPerformanceReport";

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

describe("toDimensionRows", () => {
  it("keeps the first key and drops keyless rows", () => {
    const rows = toDimensionRows([
      {
        keys: ["magento agency"],
        clicks: 3,
        impressions: 40,
        ctr: 0.075,
        position: 6.2,
      },
      { clicks: 1, impressions: 5, ctr: 0.2, position: 1 },
    ]);
    expect(rows).toEqual([
      {
        key: "magento agency",
        clicks: 3,
        impressions: 40,
        ctr: 0.075,
        position: 6.2,
      },
    ]);
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
  it("keeps only positions 5..20 and sorts by impressions desc", () => {
    const rows = buildStrikingDistanceRows([
      row("top-spot", 2, 900),
      row("close", 6.4, 100),
      row("closer", 11, 400),
      row("page-3", 24, 800),
    ]);
    expect(rows.map((r) => r.query)).toEqual(["closer", "close"]);
  });

  it("includes the boundary positions and respects the limit", () => {
    const rows = buildStrikingDistanceRows(
      [row("low-edge", 5, 10), row("high-edge", 20, 20)],
      1,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].query).toBe("high-edge");
  });

  it("drops rows without both query and page keys", () => {
    const rows = buildStrikingDistanceRows([
      {
        keys: ["only-query"],
        clicks: 1,
        impressions: 50,
        ctr: 0.02,
        position: 8,
      },
    ]);
    expect(rows).toHaveLength(0);
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

describe("previousPeriod", () => {
  it("returns the same-length window ending the day before the start", () => {
    expect(previousPeriod("2026-06-01", "2026-06-28")).toEqual({
      startDate: "2026-05-04",
      endDate: "2026-05-31",
    });
  });

  it("handles a single-day range", () => {
    expect(previousPeriod("2026-06-10", "2026-06-10")).toEqual({
      startDate: "2026-06-09",
      endDate: "2026-06-09",
    });
  });
});
