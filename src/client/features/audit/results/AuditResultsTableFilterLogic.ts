import type { AuditResultsData } from "@/client/features/audit/results/types";

export type PageRow = AuditResultsData["pages"][number];
type PerformanceResultRow = AuditResultsData["lighthouse"][number];
export type PerformanceRowData = PerformanceResultRow & {
  pageUrl: string | null;
  pagePath: string | null;
};

type LighthouseFailureFields = {
  errorMessage: string | null;
  performanceScore: number | null;
  accessibilityScore: number | null;
  bestPracticesScore: number | null;
  seoScore: number | null;
};

export type PagesFilters = {
  query: string;
  status: "all" | "ok" | "redirect" | "error" | "missing";
  minWords: string;
  maxWords: string;
  minResponseMs: string;
  maxResponseMs: string;
  missingAlt: "all" | "yes" | "no";
};

export type PerformanceFilters = {
  query: string;
  device: "all" | "desktop" | "mobile";
  status: "all" | "ok" | "failed";
  minPerf: string;
  maxPerf: string;
  minSeo: string;
  maxSeo: string;
  maxLcpSeconds: string;
};

export const EMPTY_PAGES_FILTERS: PagesFilters = {
  query: "",
  status: "all",
  minWords: "",
  maxWords: "",
  minResponseMs: "",
  maxResponseMs: "",
  missingAlt: "all",
};

export const EMPTY_PERFORMANCE_FILTERS: PerformanceFilters = {
  query: "",
  device: "all",
  status: "all",
  minPerf: "",
  maxPerf: "",
  minSeo: "",
  maxSeo: "",
  maxLcpSeconds: "",
};

function hasMissingLighthouseScores(row: LighthouseFailureFields) {
  return (
    row.performanceScore == null &&
    row.accessibilityScore == null &&
    row.bestPracticesScore == null &&
    row.seoScore == null
  );
}

export function isLighthouseFailure(row: LighthouseFailureFields) {
  return !!row.errorMessage || hasMissingLighthouseScores(row);
}

export function filterPages(rows: PageRow[], filters: PagesFilters) {
  const query = filters.query.trim().toLowerCase();
  return rows.filter((row) => {
    if (query) {
      const haystack = [row.url, row.title, row.metaDescription]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (!matchesStatus(row.statusCode, filters.status)) return false;
    if (!matchesRange(row.wordCount, filters.minWords, filters.maxWords)) {
      return false;
    }
    if (
      !matchesRange(
        row.responseTimeMs,
        filters.minResponseMs,
        filters.maxResponseMs,
      )
    ) {
      return false;
    }
    if (filters.missingAlt === "yes" && row.imagesMissingAlt <= 0) {
      return false;
    }
    if (filters.missingAlt === "no" && row.imagesMissingAlt > 0) {
      return false;
    }
    return true;
  });
}

export function filterPerformanceRows(
  rows: PerformanceRowData[],
  filters: PerformanceFilters,
) {
  const query = filters.query.trim().toLowerCase();
  return rows.filter((row) => {
    if (query) {
      const haystack = [row.pageUrl, row.pagePath].filter(Boolean).join(" ");
      if (!haystack.toLowerCase().includes(query)) return false;
    }
    if (filters.device !== "all" && row.strategy !== filters.device) {
      return false;
    }
    if (filters.status === "ok" && isLighthouseFailure(row)) return false;
    if (filters.status === "failed" && !isLighthouseFailure(row)) return false;
    if (!matchesRange(row.performanceScore, filters.minPerf, filters.maxPerf)) {
      return false;
    }
    if (!matchesRange(row.seoScore, filters.minSeo, filters.maxSeo)) {
      return false;
    }
    const maxLcpSeconds = parseFilterNumber(filters.maxLcpSeconds);
    if (
      maxLcpSeconds != null &&
      (row.lcpMs == null || row.lcpMs / 1000 > maxLcpSeconds)
    ) {
      return false;
    }
    return true;
  });
}

function matchesStatus(
  statusCode: number | null,
  status: PagesFilters["status"],
) {
  if (status === "all") return true;
  if (status === "missing") return statusCode == null;
  if (statusCode == null) return false;
  if (status === "ok") return statusCode >= 200 && statusCode < 300;
  if (status === "redirect") return statusCode >= 300 && statusCode < 400;
  return statusCode >= 400;
}

function matchesRange(value: number | null, minRaw: string, maxRaw: string) {
  const min = parseFilterNumber(minRaw);
  const max = parseFilterNumber(maxRaw);
  if (min == null && max == null) return true;
  if (value == null) return false;
  if (min != null && value < min) return false;
  if (max != null && value > max) return false;
  return true;
}

function parseFilterNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function nullableNumberSort(
  left: { getValue: (columnId: string) => number | null },
  right: { getValue: (columnId: string) => number | null },
  columnId: string,
) {
  const a = left.getValue(columnId);
  const b = right.getValue(columnId);
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

export function nullableStringSort(
  left: { getValue: (columnId: string) => string | null },
  right: { getValue: (columnId: string) => string | null },
  columnId: string,
) {
  const a = left.getValue(columnId);
  const b = right.getValue(columnId);
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}
