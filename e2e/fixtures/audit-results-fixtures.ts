const startedAt = "2026-09-07T01:00:00.000Z";
const completedAt = "2026-09-07T01:01:00.000Z";

export function getAuditStatusFixture(auditId: string) {
  return {
    id: auditId,
    startUrl: "https://audit.example.com/",
    status: "completed" as const,
    pagesCrawled: 2,
    pagesTotal: 2,
    lighthouseTotal: 1,
    lighthouseCompleted: 1,
    lighthouseFailed: 0,
    currentPhase: "completed",
    errorCode: null,
    startedAt,
    completedAt,
  };
}

export function getAuditResultsFixture(auditId: string) {
  const page = {
    id: "audit-page-1",
    auditId,
    url: "https://audit.example.com/",
    statusCode: 200,
    redirectUrl: null,
    title: "Audit fixture",
    metaDescription: "Fixture page for audit result interactions",
    canonicalUrl: "https://audit.example.com/",
    robotsMeta: null,
    ogTitle: null,
    ogDescription: null,
    ogImage: null,
    h1Count: 1,
    h2Count: 0,
    h3Count: 0,
    h4Count: 0,
    h5Count: 0,
    h6Count: 0,
    headingOrderJson: '[{"level":1,"text":"Audit fixture"}]',
    wordCount: 120,
    imagesTotal: 0,
    imagesMissingAlt: 0,
    imagesJson: "[]",
    internalLinkCount: 1,
    externalLinkCount: 0,
    hasStructuredData: false,
    hreflangTagsJson: "[]",
    isIndexable: true,
    xRobotsTag: null,
    headerCanonicalUrl: null,
    crawlDepth: 0,
    inSitemap: true,
    contentHash: "fixture-content-hash",
    fetchClass: "ok" as const,
    responseTimeMs: 80,
  };

  return {
    audit: {
      id: auditId,
      startUrl: "https://audit.example.com/",
      status: "completed" as const,
      pagesCrawled: 2,
      pagesTotal: 2,
      startedAt,
      completedAt,
      config: { maxPages: 10, lighthouseStrategy: "mobile" as const },
    },
    pages: [page],
    lighthouse: [
      {
        id: "lighthouse-1",
        auditId,
        pageId: page.id,
        strategy: "mobile" as const,
        performanceScore: 92,
        accessibilityScore: 98,
        bestPracticesScore: 96,
        seoScore: 100,
        lcpMs: 1200,
        cls: 0.02,
        inpMs: 90,
        ttfbMs: 180,
        errorMessage: null,
        r2Key: null,
        payloadSizeBytes: null,
      },
    ],
    issues: [
      {
        id: "issue-1",
        auditId,
        pageId: page.id,
        pageUrl: page.url,
        issueType: "missing-meta-description",
        severity: "warning" as const,
        detailsJson: null,
      },
    ],
  };
}
