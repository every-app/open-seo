import type { AuditResultsData } from "@/client/features/audit/results/types";
import { buildCsv, downloadCsv } from "@/client/lib/csv";

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportPages(
  pages: AuditResultsData["pages"],
  format: "csv" | "json",
) {
  const rows = pages.map((page) => ({
    url: page.url,
    statusCode: page.statusCode,
    title: page.title ?? "",
    h1Count: page.h1Count,
    wordCount: page.wordCount,
    imagesTotal: page.imagesTotal,
    imagesMissingAlt: page.imagesMissingAlt,
    responseTimeMs: page.responseTimeMs,
  }));

  if (format === "json") {
    downloadFile(
      JSON.stringify(rows, null, 2),
      "audit-pages.json",
      "application/json",
    );
    return;
  }

  const headers = [
    "URL",
    "Status",
    "Title",
    "H1",
    "Words",
    "Images",
    "Missing Alt",
    "Response Time (ms)",
  ];
  const lines = rows.map((row) => [
    row.url,
    row.statusCode,
    row.title,
    row.h1Count,
    row.wordCount,
    row.imagesTotal,
    row.imagesMissingAlt,
    row.responseTimeMs,
  ]);

  downloadCsv("audit-pages.csv", buildCsv(headers, lines));
}

export function exportPerformance(
  psi: AuditResultsData["psi"],
  pages: AuditResultsData["pages"],
  format: "csv" | "json",
) {
  const rows = psi.map((result) => {
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
  });

  if (format === "json") {
    downloadFile(
      JSON.stringify(rows, null, 2),
      "audit-performance.json",
      "application/json",
    );
    return;
  }

  const headers = [
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
  const lines = rows.map((row) => [
    row.url,
    row.strategy,
    row.performance,
    row.accessibility,
    row.seo,
    row.lcpMs,
    row.cls,
    row.inpMs,
    row.ttfbMs,
  ]);

  downloadCsv("audit-performance.csv", buildCsv(headers, lines));
}
