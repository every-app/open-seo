import { describe, expect, it } from "vitest";
import {
  buildStoredLighthouseIssues,
  buildStoredLighthouseMetrics,
} from "@/server/lib/lighthouseStoredPayload";

describe("lighthouse stored payload classification", () => {
  it("keeps actionable audits but separates metrics and diagnostics", () => {
    const audits = {
      interactive: {
        title: "Time to Interactive",
        score: 0.13,
        scoreDisplayMode: "numeric",
        displayValue: "12.8 s",
        numericValue: 12800,
      },
      "largest-contentful-paint-element": {
        title: "Largest Contentful Paint element",
        score: 0,
        scoreDisplayMode: "metricSavings",
        displayValue: "3,630 ms",
      },
      "unused-javascript": {
        title: "Reduce unused JavaScript",
        description: "Trim dead code.",
        score: 0.5,
        scoreDisplayMode: "metricSavings",
        displayValue: "Potential savings of 227 KiB",
        details: {
          overallSavingsBytes: 232886,
        },
      },
      "color-contrast": {
        title:
          "Background and foreground colors do not have a sufficient contrast ratio.",
        description: "Improve contrast.",
        score: 0,
        scoreDisplayMode: "binary",
      },
    };

    const categories = {
      performance: {
        auditRefs: [
          { id: "interactive" },
          { id: "largest-contentful-paint-element" },
          { id: "unused-javascript" },
        ],
      },
      accessibility: {
        auditRefs: [{ id: "color-contrast" }],
      },
      "best-practices": { auditRefs: [] },
      seo: { auditRefs: [] },
    };

    const issues = buildStoredLighthouseIssues({ audits, categories });
    const metrics = buildStoredLighthouseMetrics({ audits });

    expect(issues.issues.map((issue) => issue.auditKey)).toEqual([
      "unused-javascript",
      "color-contrast",
    ]);
    expect(metrics.timeToInteractive.displayValue).toBe("12.8 s");
    expect(metrics.timeToInteractive.score).toBe(13);
  });

  it("skips passing and non-actionable audits even when they appear in audit refs", () => {
    const audits = {
      passBinary: {
        title: "Serve images in next-gen formats",
        score: 1,
        scoreDisplayMode: "binary",
      },
      informative: {
        title: "User Timing marks and measures",
        score: 0,
        scoreDisplayMode: "informative",
      },
      manual: {
        title: "Structured data is valid",
        score: 0,
        scoreDisplayMode: "manual",
      },
      notApplicable: {
        title: "Uses optimized images",
        score: 0,
        scoreDisplayMode: "notApplicable",
      },
      errorAudit: {
        title: "`[accesskey]` values are unique",
        score: null,
        scoreDisplayMode: "error",
      },
      goodScore: {
        title: "Reduce unused CSS",
        score: 0.96,
        scoreDisplayMode: "metricSavings",
      },
    };

    const categories = {
      performance: {
        auditRefs: [
          { id: "passBinary" },
          { id: "informative" },
          { id: "manual" },
          { id: "notApplicable" },
          { id: "goodScore" },
        ],
      },
      accessibility: {
        auditRefs: [{ id: "errorAudit" }],
      },
      "best-practices": { auditRefs: [] },
      seo: { auditRefs: [] },
    };

    const issues = buildStoredLighthouseIssues({ audits, categories });

    expect(issues.hasIssueDetails).toBe(true);
    expect(issues.issues).toEqual([]);
  });

  it("compacts affected items and caps them at ten entries", () => {
    const items = Array.from({ length: 12 }, (_, index) => ({
      url: `https://cdn.example.com/script-${index}.js`,
      wastedBytes: 1000 + index,
      extraField: "ignored",
    }));

    const issues = buildStoredLighthouseIssues({
      audits: {
        "unused-javascript": {
          title: "Reduce unused JavaScript",
          description: "Trim dead code.",
          score: 0,
          scoreDisplayMode: "metricSavings",
          details: {
            overallSavingsBytes: 50000,
            items,
          },
        },
      },
      categories: {
        performance: { auditRefs: [{ id: "unused-javascript" }] },
        accessibility: { auditRefs: [] },
        "best-practices": { auditRefs: [] },
        seo: { auditRefs: [] },
      },
    });

    expect(issues.issues).toHaveLength(1);
    expect(issues.issues[0]?.items).toHaveLength(10);
    expect(issues.issues[0]?.items[0]).toBe(
      '{"url":"https://cdn.example.com/script-0.js","wastedBytes":1000}',
    );
  });
});
