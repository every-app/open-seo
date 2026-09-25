import { describe, expect, it } from "vitest";
import { buildAuditHtmlReport } from "@/client/features/audit/results/htmlReport";
import type { AuditResultsData } from "@/client/features/audit/results/types";

describe("buildAuditHtmlReport", () => {
  it("escapes crawled content so the downloaded file cannot run scripts", () => {
    const data = {
      audit: {
        id: "audit-1",
        startUrl: "https://example.com/",
        status: "completed" as const,
        pagesCrawled: 1,
        pagesTotal: 1,
        startedAt: "2026-09-24T00:00:00.000Z",
        completedAt: null,
        config: { maxPages: 50, lighthouseStrategy: "none" },
      },
      pages: [],
      lighthouse: [],
      issues: [
        {
          id: "issue-1",
          auditId: "audit-1",
          pageId: null,
          pageUrl: "https://example.com/<script>alert(1)</script>",
          issueType: "broken-internal-link",
          severity: "critical" as const,
          detailsJson: JSON.stringify({
            targetUrl: '"><img src=x onerror=alert(1)>',
          }),
        },
      ],
    } satisfies AuditResultsData;

    const html = buildAuditHtmlReport(data, new Date("2026-09-24"));

    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
