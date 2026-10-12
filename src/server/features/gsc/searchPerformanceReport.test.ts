import { describe, expect, it } from "vitest";
import {
  buildStrikingDistanceRows,
  previousPeriod,
  sumSearchTotals,
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
