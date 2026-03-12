import type {
  DomainSortMode,
  KeywordRow,
  PageRow,
  SortOrder,
} from "@/client/features/domain/types";
import { buildCsv, downloadCsv as downloadCsvFile } from "@/client/lib/csv";

export function toSortMode(value: string | null): DomainSortMode | undefined {
  if (value === "rank" || value === "traffic" || value === "volume") {
    return value;
  }
  return undefined;
}

export function toSortOrder(value: string | null): SortOrder | undefined {
  if (value === "asc" || value === "desc") return value;
  return undefined;
}

export function getDefaultSortOrder(sortMode: DomainSortMode): SortOrder {
  return sortMode === "rank" ? "asc" : "desc";
}

export function resolveSortOrder(
  sortMode: DomainSortMode,
  sortOrder: SortOrder | undefined,
): SortOrder {
  return sortOrder ?? getDefaultSortOrder(sortMode);
}

export function toSortSearchParam(
  sortMode: DomainSortMode,
): DomainSortMode | undefined {
  return sortMode === "rank" ? undefined : sortMode;
}

export function toSortOrderSearchParam(
  sortMode: DomainSortMode,
  sortOrder: SortOrder,
): SortOrder | undefined {
  return sortOrder === getDefaultSortOrder(sortMode) ? undefined : sortOrder;
}

export function sortableNullableNumber(
  value: number | null | undefined,
  order: SortOrder,
): number {
  if (value != null) return value;
  return order === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
}

export function toPageSortMode(
  sortMode: DomainSortMode,
): Exclude<DomainSortMode, "rank"> {
  if (sortMode === "rank") return "traffic";
  return sortMode;
}

export function normalizeDomainTarget(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  const withProtocol = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(value)
    ? value
    : `https://${value}`;

  try {
    const parsed = new URL(withProtocol);
    const hostname = parsed.hostname.toLowerCase();
    if (!hostname || !hostname.includes(".")) return null;
    if (!/^[a-z\d.-]+$/.test(hostname)) return null;

    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${hostname}${path}`;
  } catch {
    return null;
  }
}

export function formatNumber(value: number | null | undefined) {
  if (value == null) return "-";
  return new Intl.NumberFormat().format(value);
}

export function formatFloat(value: number | null | undefined) {
  if (value == null) return "-";
  if (value > 100) return new Intl.NumberFormat().format(Math.round(value));
  return value.toFixed(2);
}

export function formatMetric(
  value: number | null | undefined,
  hasData: boolean | undefined,
) {
  if (!hasData) return "Not enough data";
  return formatNumber(value);
}

export function keywordsToCsv(rows: KeywordRow[]): string {
  const headers = [
    "Keyword",
    "Rank",
    "Volume",
    "Traffic",
    "CPC",
    "URL",
    "Score",
  ];
  const lines = rows.map((row) => [
    row.keyword,
    row.position,
    row.searchVolume,
    row.traffic,
    row.cpc,
    row.relativeUrl ?? row.url,
    row.keywordDifficulty,
  ]);
  return buildCsv(headers, lines);
}

export function pagesToCsv(rows: PageRow[]): string {
  const headers = ["Page", "Organic Traffic", "Keywords"];
  const lines = rows.map((row) => [
    row.relativePath ?? row.page,
    row.organicTraffic,
    row.keywords,
  ]);
  return buildCsv(headers, lines);
}

export function downloadCsv(content: string, filename: string) {
  downloadCsvFile(filename, content);
}
