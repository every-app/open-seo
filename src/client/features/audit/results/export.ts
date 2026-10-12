import type { AuditResultsData } from "@/client/features/audit/results/types";
import { getIssueDescriptor } from "@/shared/audit-issues";
import type { CsvValue } from "@/client/lib/csv";
import { exportRows } from "@/client/lib/exportRows";

type AuditExportFormat = "csv" | "json" | "sheets";

const ISSUES_HEADERS = ["Severity", "Issue", "URL", "Details", "How To Fix"];

function issuesRows(issues: AuditResultsData["issues"]): CsvValue[][] {
  return issues.map((issue) => {
    const descriptor = getIssueDescriptor(issue.issueType);
    return [
      issue.severity,
      descriptor?.title ?? issue.issueType,
      issue.pageUrl,
      issue.detailsJson ?? "",
      descriptor?.howToFix ?? "",
    ];
  });
}

export function exportIssues(
  issues: AuditResultsData["issues"],
  format: AuditExportFormat,
) {
  void exportRows({
    format,
    feature: "audit_issues",
    headers: ISSUES_HEADERS,
    rows: issuesRows(issues),
    filename: "audit-issues",
    records:
      format === "json"
        ? issues.map((issue) => {
            const descriptor = getIssueDescriptor(issue.issueType);
            return {
              severity: issue.severity,
              issueType: issue.issueType,
              issue: descriptor?.title ?? issue.issueType,
              url: issue.pageUrl,
              details: issue.detailsJson
                ? (JSON.parse(issue.detailsJson) as unknown)
                : null,
              howToFix: descriptor?.howToFix ?? null,
            };
          })
        : undefined,
  });
}

const PAGES_HEADERS = [
  "URL",
  "Status",
  "Title",
  "H1",
  "Words",
  "Images",
  "Missing Alt",
  "Response Time (ms)",
];

function pagesRows(pages: AuditResultsData["pages"]): CsvValue[][] {
  return pages.map((page) => [
    page.url,
    page.statusCode,
    page.title ?? "",
    page.h1Count,
    page.wordCount,
    page.imagesTotal,
    page.imagesMissingAlt,
    page.responseTimeMs,
  ]);
}

const PERFORMANCE_HEADERS = [
  "URL",
  "Device",
  "Performance",
  "Accessibility",
  "SEO",
  "LCP (ms)",
  "CLS",
  "INP (ms)",
  "TTFB (ms)",
];

function performanceRows(
  lighthouse: AuditResultsData["lighthouse"],
  pages: AuditResultsData["pages"],
): CsvValue[][] {
  return lighthouse.map((result) => {
    const page = pages.find((candidate) => candidate.id === result.pageId);
    return [
      page?.url ?? "",
      result.strategy,
      result.performanceScore,
      result.accessibilityScore,
      result.seoScore,
      result.lcpMs,
      result.cls,
      result.inpMs,
      result.ttfbMs,
    ];
  });
}

export function exportPages(
  pages: AuditResultsData["pages"],
  format: AuditExportFormat,
) {
  void exportRows({
    format,
    feature: "audit_pages",
    headers: PAGES_HEADERS,
    rows: pagesRows(pages),
    filename: "audit-pages",
    records: pages.map((page) => ({
      url: page.url,
      statusCode: page.statusCode,
      title: page.title ?? "",
      h1Count: page.h1Count,
      wordCount: page.wordCount,
      imagesTotal: page.imagesTotal,
      imagesMissingAlt: page.imagesMissingAlt,
      responseTimeMs: page.responseTimeMs,
    })),
  });
}

export function exportPerformance(
  lighthouse: AuditResultsData["lighthouse"],
  pages: AuditResultsData["pages"],
  format: AuditExportFormat,
) {
  void exportRows({
    format,
    feature: "audit_performance",
    headers: PERFORMANCE_HEADERS,
    rows: performanceRows(lighthouse, pages),
    filename: "audit-performance",
    records: lighthouse.map((result) => {
      const page = pages.find((candidate) => candidate.id === result.pageId);
      return {
        url: page?.url ?? "",
        strategy: result.strategy,
        performance: result.performanceScore,
        accessibility: result.accessibilityScore,
        seo: result.seoScore,
        lcpMs: result.lcpMs,
        cls: result.cls,
        inpMs: result.inpMs,
        ttfbMs: result.ttfbMs,
      };
    }),
  });
}
