import type {
  AuditLighthouseRow,
  AuditPageRow,
} from "@/client/features/audit/results/types";
import type { PageFetchClass } from "@/shared/audit-fetch-class";
import type { GetAuditPagesInput } from "@/types/schemas/audit";

export type PageRow = AuditPageRow;
export type PerformanceRowData = AuditLighthouseRow & {
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
  fetchClass: "all" | PageFetchClass;
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
  fetchClass: "all",
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

/** The pages filters as the server's query: blank bounds are left out. */
export function toPagesQuery(
  filters: PagesFilters,
): Omit<GetAuditPagesInput, "projectId" | "auditId" | "pageSize"> {
  return {
    query: filters.query.trim() || undefined,
    status: filters.status,
    fetchClass: filters.fetchClass,
    minWords: parseFilterNumber(filters.minWords),
    maxWords: parseFilterNumber(filters.maxWords),
    minResponseMs: parseFilterNumber(filters.minResponseMs),
    maxResponseMs: parseFilterNumber(filters.maxResponseMs),
    missingAlt: filters.missingAlt,
  };
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
