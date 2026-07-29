import { describe, expect, it } from "vitest";
import type { PagespeedSnapshotLike } from "@/shared/pagespeed";
import { buildTrendSeries, parseSnapshotTime } from "./buildTrendSeries";

function snapshot(
  overrides: Partial<PagespeedSnapshotLike> & {
    id: string;
    urlId: string;
    createdAt: string;
  },
): PagespeedSnapshotLike {
  return {
    strategy: "mobile",
    performanceScore: null,
    accessibilityScore: null,
    bestPracticesScore: null,
    seoScore: null,
    lcpMs: null,
    cls: null,
    tbtMs: null,
    fcpMs: null,
    speedIndexMs: null,
    ttfbMs: null,
    fieldLcpMs: null,
    fieldInpMs: null,
    fieldCls: null,
    fieldOverallCategory: null,
    fieldSource: null,
    fetchTime: null,
    errorMessage: null,
    ...overrides,
  };
}

describe("parseSnapshotTime", () => {
  it("reads both dialects' timestamps as the same instant", () => {
    // SQLite's current_timestamp is UTC but carries no zone marker.
    expect(parseSnapshotTime("2026-07-29 10:00:00")).toBe(
      Date.UTC(2026, 6, 29, 10, 0, 0),
    );
    // Postgres emits a full ISO string; it must not get a second Z.
    expect(parseSnapshotTime("2026-07-29T10:00:00.000Z")).toBe(
      Date.UTC(2026, 6, 29, 10, 0, 0),
    );
  });

  it("respects an explicit offset", () => {
    expect(parseSnapshotTime("2026-07-29T12:00:00+02:00")).toBe(
      Date.UTC(2026, 6, 29, 10, 0, 0),
    );
  });
});

describe("buildTrendSeries", () => {
  const rows = [
    snapshot({
      id: "b",
      urlId: "u1",
      createdAt: "2026-07-29 10:00:00",
      performanceScore: 92,
      lcpMs: 2400,
    }),
    snapshot({
      id: "a",
      urlId: "u1",
      createdAt: "2026-07-28 10:00:00",
      performanceScore: 80,
      lcpMs: 3100,
    }),
    snapshot({
      id: "d",
      urlId: "u1",
      createdAt: "2026-07-29 10:00:00",
      strategy: "desktop",
      performanceScore: 99,
    }),
    snapshot({
      id: "err",
      urlId: "u1",
      createdAt: "2026-07-30 10:00:00",
      errorMessage: "quota reached",
    }),
  ];

  it("returns the requested strategy oldest-first", () => {
    const series = buildTrendSeries(rows, "mobile");

    expect(series.map((point) => point.performance)).toEqual([80, 92]);
    expect(series[0]?.t).toBeLessThan(series[1]?.t ?? 0);
    expect(series[1]?.lcpMs).toBe(2400);
  });

  it("leaves a gap for failed runs rather than plotting a zero", () => {
    expect(buildTrendSeries(rows, "mobile")).toHaveLength(2);
  });

  it("does not mix strategies", () => {
    const series = buildTrendSeries(rows, "desktop");
    expect(series).toHaveLength(1);
    expect(series[0]?.performance).toBe(99);
  });

  it("drops a run whose timestamp cannot be parsed", () => {
    const series = buildTrendSeries(
      [snapshot({ id: "x", urlId: "u1", createdAt: "not a date" })],
      "mobile",
    );
    expect(series).toEqual([]);
  });
});
