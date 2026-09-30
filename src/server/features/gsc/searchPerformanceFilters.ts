import type { GscPerformanceFilter } from "@/server/features/gsc/searchAnalytics";
import type { SearchPerformanceMetricFilters } from "@/types/schemas/search-performance";

type MetricFilterableRow = {
  clicks: number;
  impressions: number;
  position: number;
};

type SearchPerformanceDimensionRow = MetricFilterableRow & {
  key: string;
  ctr: number;
};

type StrikingDistanceFilterableRow = MetricFilterableRow & {
  query: string;
  page: string;
};

/** Strip trailing wildcard and whitespace from a user-entered path prefix. */
export function normalizePagePathFilter(
  input: string | undefined,
): string | undefined {
  if (!input?.trim()) return undefined;
  let normalized = input.trim();
  if (normalized.endsWith("*")) {
    normalized = normalized.slice(0, -1).trimEnd();
  }
  return normalized.length > 0 ? normalized : undefined;
}

export function toPagePathGscFilter(pagePath: string): GscPerformanceFilter {
  const expression = normalizePagePathFilter(pagePath);
  if (!expression) {
    throw new Error("Page path filter requires a non-empty expression");
  }
  return { dimension: "page", operator: "contains", expression };
}

export function matchesMetricFilters(
  row: MetricFilterableRow,
  filters: SearchPerformanceMetricFilters,
): boolean {
  if (
    filters.minImpressions !== undefined &&
    row.impressions < filters.minImpressions
  ) {
    return false;
  }
  if (
    filters.maxImpressions !== undefined &&
    row.impressions > filters.maxImpressions
  ) {
    return false;
  }
  if (filters.minClicks !== undefined && row.clicks < filters.minClicks) {
    return false;
  }
  if (filters.maxClicks !== undefined && row.clicks > filters.maxClicks) {
    return false;
  }
  if (filters.minPosition !== undefined && row.position < filters.minPosition) {
    return false;
  }
  if (filters.maxPosition !== undefined && row.position > filters.maxPosition) {
    return false;
  }
  return true;
}

export function filterDimensionRowsByMetrics(
  rows: SearchPerformanceDimensionRow[],
  filters: SearchPerformanceMetricFilters,
): SearchPerformanceDimensionRow[] {
  return rows.filter((row) => matchesMetricFilters(row, filters));
}

export function filterStrikingDistanceByMetrics(
  rows: StrikingDistanceFilterableRow[],
  filters: SearchPerformanceMetricFilters,
): StrikingDistanceFilterableRow[] {
  return rows.filter((row) => matchesMetricFilters(row, filters));
}

export function paginateRows<T>(
  rows: T[],
  page: number,
  pageSize: number,
): { rows: T[]; hasNextPage: boolean } {
  const offset = (page - 1) * pageSize;
  const pageRows = rows.slice(offset, offset + pageSize);
  return {
    rows: pageRows,
    hasNextPage: offset + pageSize < rows.length,
  };
}
