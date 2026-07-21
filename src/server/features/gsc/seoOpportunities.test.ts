import { describe, expect, it } from "vitest";
import {
  buildSeoOpportunities,
  expectedCtrForPosition,
  type SeoOpportunity,
} from "@/server/features/gsc/seoOpportunities";

describe("expectedCtrForPosition", () => {
  it("returns conservative CTR baselines by ranking band", () => {
    expect(expectedCtrForPosition(2.1)).toBeCloseTo(0.12);
    expect(expectedCtrForPosition(4.5)).toBeCloseTo(0.08);
    expect(expectedCtrForPosition(7.2)).toBeCloseTo(0.04);
    expect(expectedCtrForPosition(15.4)).toBeCloseTo(0.02);
    expect(expectedCtrForPosition(31)).toBeCloseTo(0.01);
  });
});

describe("buildSeoOpportunities", () => {
  it("finds striking-distance, low-CTR, and declining-page opportunities", () => {
    const currentQueryPageRows = [
      {
        keys: ["ledger settlement", "https://ledgerpe.com/settle"],
        clicks: 20,
        impressions: 500,
        ctr: 0.04,
        position: 8.2,
      },
      {
        keys: ["crypto offramp india", "https://ledgerpe.com/offramp"],
        clicks: 30,
        impressions: 800,
        ctr: 0.0375,
        position: 6.5,
      },
    ];
    const currentPageRows = [
      {
        keys: ["https://ledgerpe.com/settle"],
        clicks: 20,
        impressions: 500,
        ctr: 0.04,
        position: 8.2,
      },
      {
        keys: ["https://ledgerpe.com/home"],
        clicks: 12,
        impressions: 600,
        ctr: 0.02,
        position: 3.2,
      },
      {
        keys: ["https://ledgerpe.com/offramp"],
        clicks: 30,
        impressions: 800,
        ctr: 0.0375,
        position: 6.5,
      },
    ];
    const previousPageRows = [
      {
        keys: ["https://ledgerpe.com/offramp"],
        clicks: 42,
        impressions: 1200,
        ctr: 0.035,
        position: 6.3,
      },
    ];
    const auditIssues: Array<{
      severity: "critical" | "warning" | "info";
      issueType: string;
      pageUrl: string;
      detailsJson: string | null;
    }> = [
      {
        severity: "critical",
        issueType: "missing_title",
        pageUrl: "https://ledgerpe.com/settle",
        detailsJson: null,
      },
    ];
    const auditPages = [
      {
        url: "https://ledgerpe.com/settle",
        title: null,
        metaDescription: "desc",
        wordCount: 120,
        internalLinkCount: 1,
        crawlDepth: 4,
        statusCode: 200,
        fetchClass: "ok",
        isIndexable: true,
        inSitemap: true,
        responseTimeMs: 220,
      },
    ];

    const result = buildSeoOpportunities({
      currentQueryPageRows,
      currentPageRows,
      previousPageRows,
      auditIssues,
      auditPages,
      limit: 10,
    });

    expect(result.opportunities.map((row: SeoOpportunity) => row.type)).toEqual(
      expect.arrayContaining([
        "striking_distance",
        "low_ctr",
        "declining_page",
        "technical_issue",
      ]),
    );
    expect(
      result.opportunities.find(
        (row: SeoOpportunity) => row.type === "striking_distance",
      ),
    ).toMatchObject({
      query: "crypto offramp india",
      page: "https://ledgerpe.com/offramp",
      source: "google_search_console",
      measurement: "measured",
    });
    expect(
      result.opportunities.find(
        (row: SeoOpportunity) => row.type === "technical_issue",
      ),
    ).toMatchObject({
      page: "https://ledgerpe.com/settle",
      source: "site_audit",
      measurement: "measured",
    });
  });

  it("returns no opportunities when there is no source data", () => {
    const result = buildSeoOpportunities({
      currentQueryPageRows: [],
      currentPageRows: [],
      previousPageRows: [],
      auditIssues: [],
      auditPages: [],
      limit: 10,
    });

    expect(result.opportunities).toEqual([]);
    expect(result.summary.total).toBe(0);
  });
});
