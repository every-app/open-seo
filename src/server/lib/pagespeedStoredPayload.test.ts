import { describe, expect, it } from "vitest";
import {
  buildStoredPagespeedPayload,
  readStoredPagespeedPayload,
  type PagespeedLighthouseResult,
} from "./pagespeedStoredPayload";

/**
 * A real PSI response, trimmed to the fields extraction reads. Shapes and
 * values are verbatim from a live call (Lighthouse 13.4.1) — the point is that
 * issue extraction, written for DataForSEO's Lighthouse, works unchanged on
 * Google's.
 */
const LIVE_SHAPE: PagespeedLighthouseResult = {
  requestedUrl: "https://www.wikipedia.org/",
  finalUrl: "https://www.wikipedia.org/",
  lighthouseVersion: "13.4.1",
  fetchTime: "2026-07-29T12:59:39.081Z",
  categories: {
    performance: {
      score: 0.99,
      auditRefs: [
        { id: "unused-javascript" },
        { id: "largest-contentful-paint" },
      ],
    },
    accessibility: { score: 0.95, auditRefs: [{ id: "color-contrast" }] },
    "best-practices": { score: 1, auditRefs: [{ id: "errors-in-console" }] },
    seo: { score: 1, auditRefs: [{ id: "meta-description" }] },
  },
  audits: {
    "unused-javascript": {
      title: "Reduce unused JavaScript",
      description: "Reduce unused JS to lower bytes consumed.",
      score: 0.5,
      scoreDisplayMode: "metricSavings",
      displayValue: "Potential savings of 40 KiB",
      details: {
        overallSavingsBytes: 41000,
        items: [{ url: "https://a.com/x.js" }],
      },
    },
    "largest-contentful-paint": {
      title: "Largest Contentful Paint",
      score: 0.99,
      // Numeric audits are metrics, not actionable issues.
      scoreDisplayMode: "numeric",
      numericValue: 1344.5,
    },
    "color-contrast": {
      title: "Contrast is satisfactory",
      description: "Background and foreground colors have enough contrast.",
      score: 1,
      scoreDisplayMode: "binary",
    },
    "errors-in-console": {
      title: "No browser errors logged",
      description: "Errors logged to the console indicate unresolved problems.",
      score: 1,
      scoreDisplayMode: "binary",
    },
    "meta-description": {
      title: "Document does not have a meta description",
      description: "Meta descriptions may be included in search results.",
      score: 0,
      scoreDisplayMode: "binary",
    },
  },
};

describe("buildStoredPagespeedPayload", () => {
  it("extracts issues from a real PSI lighthouseResult", () => {
    const payload = buildStoredPagespeedPayload({
      lighthouseResult: LIVE_SHAPE,
      strategy: "mobile",
      url: "https://www.wikipedia.org/",
    });

    expect(payload.version).toBe(1);
    expect(payload.source).toBe("pagespeed-insights");
    expect(payload.metadata).toMatchObject({
      requestedUrl: "https://www.wikipedia.org/",
      strategy: "mobile",
      lighthouseVersion: "13.4.1",
      fetchedAt: "2026-07-29T12:59:39.081Z",
    });
    // Scores arrive 0-1 and are stored as percentages.
    expect(payload.scores).toEqual({
      performance: 99,
      accessibility: 95,
      "best-practices": 100,
      seo: 100,
    });
    expect(payload.issues.length).toBeGreaterThan(0);
  });

  it("keeps failing audits and drops passing and numeric ones", () => {
    const { issues } = buildStoredPagespeedPayload({
      lighthouseResult: LIVE_SHAPE,
      strategy: "mobile",
      url: "https://www.wikipedia.org/",
    });
    const keys = issues.map((issue) => issue.auditKey);

    expect(keys).toContain("unused-javascript");
    expect(keys).toContain("meta-description");
    // Passing binary audits are not issues.
    expect(keys).not.toContain("color-contrast");
    expect(keys).not.toContain("errors-in-console");
    // Metric audits belong on the snapshot row, not the issue list.
    expect(keys).not.toContain("largest-contentful-paint");
  });

  it("carries the fields the issue list renders", () => {
    const { issues } = buildStoredPagespeedPayload({
      lighthouseResult: LIVE_SHAPE,
      strategy: "mobile",
      url: "https://www.wikipedia.org/",
    });
    const issue = issues.find((row) => row.auditKey === "unused-javascript");

    expect(issue).toMatchObject({
      category: "performance",
      title: "Reduce unused JavaScript",
      displayValue: "Potential savings of 40 KiB",
      impactBytes: 41000,
    });
    expect(issue?.severity).toMatch(/critical|warning|info/);
  });

  it("falls back to the requested URL when metadata is absent", () => {
    const payload = buildStoredPagespeedPayload({
      lighthouseResult: { categories: {}, audits: {} },
      strategy: "desktop",
      url: "https://fallback.example/",
    });

    expect(payload.metadata.requestedUrl).toBe("https://fallback.example/");
    expect(payload.metadata.finalUrl).toBe("https://fallback.example/");
    expect(payload.metadata.lighthouseVersion).toBeNull();
    expect(payload.issues).toEqual([]);
  });

  it("round-trips through R2 storage", () => {
    const payload = buildStoredPagespeedPayload({
      lighthouseResult: LIVE_SHAPE,
      strategy: "mobile",
      url: "https://www.wikipedia.org/",
    });

    expect(readStoredPagespeedPayload(JSON.stringify(payload))).toEqual(
      payload,
    );
  });

  it("rejects a payload shape it does not recognize", () => {
    expect(() => readStoredPagespeedPayload('{"version":99}')).toThrow();
  });
});
