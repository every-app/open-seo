import { describe, expect, it } from "vitest";
import {
  computeNextPagespeedRunAt,
  CWV_THRESHOLDS,
  formatCls,
  formatMs,
  formatScoreWithDelta,
  latestByUrl,
  metricTone,
  scoreDelta,
  scoreTone,
  type PagespeedSnapshotLike,
} from "./pagespeed";

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

describe("scoreTone", () => {
  it("bands on Lighthouse's own thresholds", () => {
    expect(scoreTone(90)).toBe("good");
    expect(scoreTone(89)).toBe("average");
    expect(scoreTone(50)).toBe("average");
    expect(scoreTone(49)).toBe("poor");
    expect(scoreTone(null)).toBe("none");
  });
});

describe("metricTone", () => {
  it("bands Core Web Vitals on the good/poor thresholds", () => {
    expect(metricTone(2500, CWV_THRESHOLDS.lcpMs)).toBe("good");
    expect(metricTone(3000, CWV_THRESHOLDS.lcpMs)).toBe("average");
    expect(metricTone(4500, CWV_THRESHOLDS.lcpMs)).toBe("poor");
    expect(metricTone(null, CWV_THRESHOLDS.lcpMs)).toBe("none");
  });
});

describe("formatting", () => {
  it("renders sub-second values in ms and the rest in seconds", () => {
    expect(formatMs(450)).toBe("450 ms");
    expect(formatMs(2500)).toBe("2.5 s");
    expect(formatMs(null)).toBe("—");
  });

  it("renders CLS to three decimals", () => {
    expect(formatCls(0.05)).toBe("0.050");
    expect(formatCls(null)).toBe("—");
  });

  it("appends a signed delta only when the score moved", () => {
    expect(formatScoreWithDelta(92, 89)).toBe("92 (+3)");
    expect(formatScoreWithDelta(85, 90)).toBe("85 (-5)");
    expect(formatScoreWithDelta(90, 90)).toBe("90");
    expect(formatScoreWithDelta(90, null)).toBe("90");
    expect(formatScoreWithDelta(null, 90)).toBe("—");
  });
});

describe("scoreDelta", () => {
  it("is null unless both runs scored", () => {
    expect(scoreDelta(90, 80)).toBe(10);
    expect(scoreDelta(90, null)).toBeNull();
    expect(scoreDelta(null, 80)).toBeNull();
  });
});

describe("computeNextPagespeedRunAt", () => {
  const now = new Date("2026-07-30T12:00:00.000Z");

  it("keeps the daily slot when a sweep fires late", () => {
    // Due at 11:40, actually ran at 12:00. Tomorrow must still be 11:40, not
    // 12:00 — otherwise the slot walks later every single day.
    expect(computeNextPagespeedRunAt(now, "2026-07-30T11:40:00.000Z")).toBe(
      "2026-07-31T11:40:00.000Z",
    );
  });

  it("keeps the slot even when a whole day was missed", () => {
    // Anchor is yesterday's 11:40 slot: stepping once lands at today 11:40,
    // already past, so it must step again rather than emit a past time.
    expect(computeNextPagespeedRunAt(now, "2026-07-29T11:40:00.000Z")).toBe(
      "2026-07-31T11:40:00.000Z",
    );
  });

  it("schedules a day out when there is no anchor", () => {
    expect(computeNextPagespeedRunAt(now, null)).toBe(
      "2026-07-31T12:00:00.000Z",
    );
  });

  it("does not queue catch-up runs after a long outage", () => {
    // A two-month-stale anchor must land once in the future, not once per
    // missed day.
    const next = computeNextPagespeedRunAt(now, "2026-06-01T00:00:00.000Z");
    expect(next).toBe("2026-07-31T00:00:00.000Z");
    expect(Date.parse(next)).toBeGreaterThan(now.getTime());
  });

  it("ignores an unparseable anchor", () => {
    expect(computeNextPagespeedRunAt(now, "not a date")).toBe(
      "2026-07-31T12:00:00.000Z",
    );
  });
});

describe("latestByUrl", () => {
  const rows = [
    snapshot({
      id: "a1",
      urlId: "u1",
      createdAt: "2026-07-01",
      performanceScore: 70,
    }),
    snapshot({
      id: "a3",
      urlId: "u1",
      createdAt: "2026-07-03",
      performanceScore: 90,
    }),
    snapshot({
      id: "a2",
      urlId: "u1",
      createdAt: "2026-07-02",
      performanceScore: 80,
    }),
    snapshot({
      id: "b1",
      urlId: "u2",
      createdAt: "2026-07-01",
      performanceScore: 50,
    }),
    snapshot({
      id: "d1",
      urlId: "u1",
      createdAt: "2026-07-04",
      strategy: "desktop",
      performanceScore: 99,
    }),
  ];

  it("picks the newest run per URL for the requested strategy", () => {
    const latest = latestByUrl(rows, "mobile");

    expect(latest.get("u1")?.snapshot.id).toBe("a3");
    expect(latest.get("u1")?.previous?.id).toBe("a2");
    expect(latest.get("u2")?.snapshot.id).toBe("b1");
    expect(latest.get("u2")?.previous).toBeNull();
  });

  it("does not mix strategies", () => {
    expect(latestByUrl(rows, "desktop").get("u1")?.snapshot.id).toBe("d1");
    expect(latestByUrl(rows, "desktop").has("u2")).toBe(false);
  });

  it("keeps a failed run as the latest but compares against the last good one", () => {
    const withFailure = [
      ...rows,
      snapshot({
        id: "err",
        urlId: "u1",
        createdAt: "2026-07-05",
        errorMessage: "quota reached",
      }),
    ];

    const entry = latestByUrl(withFailure, "mobile").get("u1");

    expect(entry?.snapshot.id).toBe("err");
    expect(entry?.previous?.id).toBe("a3");
  });
});
