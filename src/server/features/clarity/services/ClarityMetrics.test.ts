import { describe, expect, it } from "vitest";
import {
  clarityReportCoverage,
  normalizeClarityOverview,
  normalizeClarityUrlInsights,
} from "@/server/features/clarity/services/ClarityMetrics";
import { prepareClarityResponseForCache } from "@/server/features/clarity/services/ClarityPrivacy";

describe("Clarity metric normalization", () => {
  it("normalizes the mixed numeric types and field aliases returned by Clarity", () => {
    const result = normalizeClarityOverview([
      {
        metricName: "Traffic",
        information: [
          {
            totalSessionCount: "120",
            totalBotSessionCount: "3",
            distantUserCount: "80",
            PagesPerSessionPercentage: 1.5,
          },
        ],
      },
      {
        metricName: "EngagementTime",
        information: [{ activeTime: "30", totalTime: "120" }],
      },
      {
        metricName: "ScrollDepth",
        information: [{ averageScrollDepth: 42.5 }],
      },
      {
        metricName: "ErrorClickCount",
        information: [
          {
            subTotal: 2,
            pagesViews: 8,
            sessionsCount: 4,
            sessionsWithMetricPercentage: 3.33,
            sessionsWithoutMetricPercentage: 96.67,
          },
        ],
      },
      {
        metricName: "ReferrerUrl",
        information: [
          { name: null, sessionsCount: "70" },
          { name: "https://search.example", sessionsCount: "50" },
        ],
      },
      {
        metricName: "PopularPages",
        information: [{ url: "https://example.com/", visitsCount: "99" }],
      },
    ]);

    expect(result.traffic).toEqual({
      sessions: 120,
      botSessions: 3,
      distinctUsers: 80,
      pagesPerSession: 1.5,
    });
    expect(result.engagement).toEqual({
      averageActiveTimeSeconds: 30,
      averageTotalTimeSeconds: 120,
      activeTimePercent: 25,
    });
    expect(result.scrollDepthPercent).toBe(42.5);
    expect(result.friction.errorClicks).toMatchObject({
      count: 2,
      pageViews: 8,
      sessions: 4,
      sessionsWithMetricPercent: 3.33,
    });
    expect(result.breakdowns.referrers).toEqual([
      { label: null, sessions: 70 },
      { label: "https://search.example", sessions: 50 },
    ]);
    expect(result.breakdowns.popularPages).toEqual([
      { url: "https://example.com/", visits: 99 },
    ]);
  });

  it("fails closed on invalid counts, percentages, ratios, and durations", () => {
    const result = normalizeClarityOverview([
      {
        metricName: "Traffic",
        information: [
          {
            totalSessionCount: "-1",
            totalBotSessionCount: "1.5",
            distinctUserCount: "9007199254740992",
            pagesPerSessionPercentage: -0.1,
          },
        ],
      },
      {
        metricName: "ScrollDepth",
        information: [{ averageScrollDepth: 101 }],
      },
      {
        metricName: "EngagementTime",
        information: [{ activeTime: "20", totalTime: "10" }],
      },
      {
        metricName: "DeadClickCount",
        information: [
          {
            subTotal: "NaN",
            sessionsWithMetricPercentage: -1,
            sessionsWithoutMetricPercentage: 101,
          },
        ],
      },
    ]);

    expect(result.traffic).toEqual({
      sessions: null,
      botSessions: null,
      distinctUsers: null,
      pagesPerSession: null,
    });
    expect(result.scrollDepthPercent).toBeNull();
    expect(result.engagement.activeTimePercent).toBeNull();
    expect(result.friction.deadClicks).toMatchObject({
      count: null,
      sessionsWithMetricPercent: null,
      sessionsWithoutMetricPercent: null,
    });
  });

  it("merges real `Url` dimension rows into session-sorted page records", () => {
    const result = normalizeClarityUrlInsights([
      {
        metricName: "Traffic",
        information: [
          { Url: "https://example.com/b", totalSessionCount: "4" },
          { Url: "https://example.com/a", totalSessionCount: "10" },
        ],
      },
      {
        metricName: "ScrollDepth",
        information: [
          { Url: "https://example.com/a", averageScrollDepth: 61.2 },
        ],
      },
      {
        metricName: "RageClickCount",
        information: [
          {
            Url: "https://example.com/a",
            subTotal: "3",
            sessionsCount: "2",
          },
        ],
      },
      {
        metricName: "EngagementTime",
        information: [
          { URL: "https://example.com/a", activeTime: "5", totalTime: "20" },
        ],
      },
    ]);

    expect(result.pages.map((page) => page.url)).toEqual([
      "https://example.com/a",
      "https://example.com/b",
    ]);
    expect(result.pages[0]).toMatchObject({
      traffic: { sessions: 10 },
      engagement: { activeTimePercent: 25 },
      scrollDepthPercent: 61.2,
      friction: { rageClicks: { count: 3, sessions: 2 } },
    });
  });

  it("keeps redacted URL variants separate and joins each metric correctly", () => {
    const prepared = prepareClarityResponseForCache([
      {
        metricName: "Traffic",
        information: [
          {
            Url: "https://example.com/page?campaign=private-a",
            totalSessionCount: "9",
          },
          {
            Url: "https://example.com/page?campaign=private-b",
            totalSessionCount: "3",
          },
        ],
      },
      {
        metricName: "EngagementTime",
        information: [
          {
            Url: "https://example.com/page?campaign=private-b",
            activeTime: "3",
            totalTime: "30",
          },
          {
            Url: "https://example.com/page?campaign=private-a",
            activeTime: "10",
            totalTime: "20",
          },
        ],
      },
    ]);

    const result = normalizeClarityUrlInsights(prepared);
    expect(result.pages).toHaveLength(2);
    expect(result.pages.map((page) => page.url)).toEqual([
      "https://example.com/page",
      "https://example.com/page",
    ]);
    expect(result.pages[0]).toMatchObject({
      privacyVariant: { index: 1, count: 2 },
      traffic: { sessions: 9 },
      engagement: { activeTimePercent: 50 },
    });
    expect(result.pages[1]).toMatchObject({
      privacyVariant: { index: 2, count: 2 },
      traffic: { sessions: 3 },
      engagement: { activeTimePercent: 10 },
    });
    expect(JSON.stringify(result)).not.toContain("private-");
  });

  it("reports provider-side row caps independently of consumer slicing", () => {
    const coverage = clarityReportCoverage(
      [
        {
          metricName: "Traffic",
          information: Array.from({ length: 1_000 }, () => ({})),
        },
        { metricName: "Device", information: [{ name: "PC" }] },
        { metricName: "FutureMetric", information: [] },
        { metricName: "Traffic", information: [] },
      ],
      "url",
    );

    expect(coverage).toMatchObject({
      rawMetricGroups: 4,
      rawInformationRows: 1_001,
      providerRowLimit: 1_000,
      providerResponseRowLimitReached: true,
      providerLimitedMetricNames: ["Traffic"],
      unknownMetricNames: ["Device", "FutureMetric"],
      duplicateMetricNames: ["Traffic"],
    });
    expect(coverage.missingExpectedMetricNames).toContain("EngagementTime");
  });

  it("does not infer a provider cap from rows summed across metric groups", () => {
    const coverage = clarityReportCoverage(
      [
        {
          metricName: "Traffic",
          information: Array.from({ length: 600 }, () => ({})),
        },
        {
          metricName: "EngagementTime",
          information: Array.from({ length: 600 }, () => ({})),
        },
      ],
      "url",
    );

    expect(coverage.rawInformationRows).toBe(1_200);
    expect(coverage.providerResponseRowLimitReached).toBe(false);
    expect(coverage.providerLimitedMetricNames).toEqual([]);
  });
});
