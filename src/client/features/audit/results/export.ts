import { toast } from "sonner";
import type {
  AuditIssueRow,
  AuditLighthouseRow,
  AuditPageRow,
} from "@/client/features/audit/results/types";
import { getIssueDescriptor } from "@/shared/audit-issues";
import type { CsvValue } from "@/client/lib/csv";
import { exportRows } from "@/client/lib/exportRows";
import { getAuditIssues, getAuditPages } from "@/serverFunctions/audit";
import { AUDIT_ROWS_MAX_PAGE_SIZE } from "@/types/schemas/audit";

type AuditExportFormat = "csv" | "json" | "sheets";
type AuditRef = { projectId: string; auditId: string };

/**
 * Loads every row a page at a time. A large audit is too big for one Worker
 * request, but small enough to assemble in the browser for a download.
 */
async function fetchAllRows<T>(
  fetchPage: (page: number) => Promise<T[]>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 1; ; page += 1) {
    const batch = await fetchPage(page);
    rows.push(...batch);
    if (batch.length < AUDIT_ROWS_MAX_PAGE_SIZE) return rows;
  }
}

async function withExportToast(run: () => Promise<void>) {
  const toastId = toast.loading("Preparing export…");
  try {
    await run();
  } catch {
    toast.error("Could not export the audit results");
  } finally {
    toast.dismiss(toastId);
  }
}

const ISSUES_HEADERS = ["Severity", "Issue", "URL", "Details", "How To Fix"];

function issuesRows(issues: AuditIssueRow[]): CsvValue[][] {
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

export function exportIssues(ref: AuditRef, format: AuditExportFormat) {
  void withExportToast(async () => {
    const issues = await fetchAllRows((page) =>
      getAuditIssues({
        data: { ...ref, page, pageSize: AUDIT_ROWS_MAX_PAGE_SIZE },
      }),
    );
    await exportRows({
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

function pagesRows(pages: AuditPageRow[]): CsvValue[][] {
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

export function exportPages(ref: AuditRef, format: AuditExportFormat) {
  void withExportToast(async () => {
    const pages = await fetchAllRows(async (page) => {
      const result = await getAuditPages({
        data: { ...ref, page, pageSize: AUDIT_ROWS_MAX_PAGE_SIZE },
      });
      return result.rows;
    });
    await exportRows({
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
  });
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

export function exportPerformance(
  lighthouse: AuditLighthouseRow[],
  format: AuditExportFormat,
) {
  void exportRows({
    format,
    feature: "audit_performance",
    headers: PERFORMANCE_HEADERS,
    rows: lighthouse.map((result) => [
      result.pageUrl ?? "",
      result.strategy,
      result.performanceScore,
      result.accessibilityScore,
      result.seoScore,
      result.lcpMs,
      result.cls,
      result.inpMs,
      result.ttfbMs,
    ]),
    filename: "audit-performance",
    records: lighthouse.map((result) => ({
      url: result.pageUrl ?? "",
      strategy: result.strategy,
      performance: result.performanceScore,
      accessibility: result.accessibilityScore,
      seo: result.seoScore,
      lcpMs: result.lcpMs,
      cls: result.cls,
      inpMs: result.inpMs,
      ttfbMs: result.ttfbMs,
    })),
  });
}
