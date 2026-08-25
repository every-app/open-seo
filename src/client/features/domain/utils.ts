import type {
  DomainSortMode,
  KeywordRow,
  PageRow,
  SortOrder,
} from "@/client/features/domain/types";
import { parseResearchTarget } from "@/shared/researchScope";

export function toSortMode(value: string | null): DomainSortMode | undefined {
  if (
    value === "rank" ||
    value === "traffic" ||
    value === "volume" ||
    value === "score" ||
    value === "cpc"
  ) {
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
  return sortMode === "traffic" ? undefined : sortMode;
}

export function toSortOrderSearchParam(
  sortMode: DomainSortMode,
  sortOrder: SortOrder,
): SortOrder | undefined {
  return sortOrder === getDefaultSortOrder(sortMode) ? undefined : sortOrder;
}

export function toPageSortMode(
  sortMode: DomainSortMode,
): "traffic" | "keywords" {
  if (sortMode === "volume") return "keywords";
  return "traffic";
}

/** Normalized path of a domain input; `""` when it is a root or unparseable. */
export function getResearchInputPath(input: string): string {
  const parsed = parseResearchTarget(input);
  return parsed.ok ? parsed.target.path : "";
}

export function formatNumber(value: number | null | undefined) {
  if (value == null) return "-";
  return new Intl.NumberFormat().format(value);
}

export function formatRounded(value: number | null | undefined) {
  if (value == null) return "-";
  return new Intl.NumberFormat().format(Math.round(value));
}

export function formatMetric(
  value: number | null | undefined,
  hasData: boolean | undefined,
) {
  if (!hasData) return "Not enough data";
  return formatRounded(value);
}

type ExportTable = { headers: string[]; rows: (string | number | null)[][] };

export function keywordsToTable(rows: KeywordRow[]): ExportTable {
  return {
    headers: ["Keyword", "Rank", "Volume", "Traffic", "CPC", "URL", "Score"],
    rows: rows.map((row) => [
      row.keyword,
      row.position,
      row.searchVolume,
      row.traffic,
      row.cpc,
      row.url ?? row.relativeUrl,
      row.keywordDifficulty,
    ]),
  };
}

export function pagesToTable(rows: PageRow[]): ExportTable {
  return {
    headers: ["Page", "Organic Traffic", "Keywords"],
    rows: rows.map((row) => [row.page, row.organicTraffic, row.keywords]),
  };
}
