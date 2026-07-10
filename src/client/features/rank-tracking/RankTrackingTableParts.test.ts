import { describe, expect, it } from "vitest";
import type { RankTrackingRow } from "@/types/schemas/rank-tracking";
import {
  buildRankTrackingExport,
  formatCheckedAtDate,
} from "./RankTrackingTableParts";

function makeRow(keyword: string): RankTrackingRow {
  return {
    trackingKeywordId: keyword,
    keyword,
    searchVolume: 100,
    keywordDifficulty: 20,
    cpc: 1.5,
    desktop: {
      position: 3,
      previousPosition: 5,
      rankingUrl: "/page",
      serpFeatures: [],
    },
    mobile: {
      position: 4,
      previousPosition: null,
      rankingUrl: null,
      serpFeatures: [],
    },
  };
}

describe("formatCheckedAtDate", () => {
  it("formats a Postgres ISO timestamp as a machine-sortable YYYY-MM-DD date", () => {
    expect(formatCheckedAtDate("2026-07-01T12:34:56.000Z")).toBe("2026-07-01");
  });

  it("keeps the stored UTC date for a zone-less SQLite/D1 timestamp", () => {
    // "YYYY-MM-DD HH:MM:SS" has no zone; slicing avoids new Date() parsing it
    // as local time and shifting the calendar day (e.g. exporting 2026-06-30).
    expect(formatCheckedAtDate("2026-07-01 01:30:00")).toBe("2026-07-01");
  });

  it("returns an empty string for missing values", () => {
    expect(formatCheckedAtDate(null)).toBe("");
    expect(formatCheckedAtDate(undefined)).toBe("");
    expect(formatCheckedAtDate("")).toBe("");
  });

  it("returns an empty string for unparseable values instead of 'Invalid Date'", () => {
    expect(formatCheckedAtDate("not-a-date")).toBe("");
  });
});

describe("buildRankTrackingExport — Last checked at column", () => {
  it("appends a 'Last checked at' header without shifting existing columns", () => {
    const { headers } = buildRankTrackingExport(
      [makeRow("alpha")],
      true,
      true,
      { lastCheckedAt: "2026-07-01T00:00:00.000Z" },
    );

    // Existing columns keep their positions (CPC stays at index 3, which the
    // CSV cents-formatting relies on).
    expect(headers[0]).toBe("Keyword");
    expect(headers[3]).toBe("CPC");
    // New column is appended last.
    expect(headers[headers.length - 1]).toBe("Last checked at");
  });

  it("puts the formatted date in the last cell of every row", () => {
    const { rows } = buildRankTrackingExport(
      [makeRow("alpha"), makeRow("beta")],
      true,
      true,
      { lastCheckedAt: "2026-07-01T12:00:00.000Z" },
    );

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row[row.length - 1]).toBe("2026-07-01");
    }
  });

  it("keeps the column present but empty when no run timestamp is available", () => {
    const { headers, rows } = buildRankTrackingExport(
      [makeRow("alpha")],
      true,
      true,
    );

    expect(headers[headers.length - 1]).toBe("Last checked at");
    expect(rows[0][rows[0].length - 1]).toBe("");
  });

  it("includes the date regardless of which devices are shown", () => {
    const desktopOnly = buildRankTrackingExport([makeRow("a")], true, false, {
      lastCheckedAt: "2026-07-01T00:00:00.000Z",
    });
    const mobileOnly = buildRankTrackingExport([makeRow("a")], false, true, {
      lastCheckedAt: "2026-07-01T00:00:00.000Z",
    });

    expect(desktopOnly.headers[desktopOnly.headers.length - 1]).toBe(
      "Last checked at",
    );
    expect(desktopOnly.rows[0][desktopOnly.rows[0].length - 1]).toBe(
      "2026-07-01",
    );
    expect(mobileOnly.rows[0][mobileOnly.rows[0].length - 1]).toBe(
      "2026-07-01",
    );
  });
});
