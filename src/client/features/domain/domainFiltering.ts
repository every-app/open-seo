import { sortBy } from "remeda";
import { sortableNullableNumber } from "@/client/features/domain/utils";
import type {
  DomainFilterValues,
  DomainSortMode,
  KeywordRow,
  SortOrder,
} from "@/client/features/domain/types";

function parseTerms(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[,+]/)
    .map((term) => term.trim())
    .filter(Boolean);
}

function passesNumericFilter(
  value: number | null | undefined,
  min: string,
  max: string,
): boolean {
  const v = value ?? 0;
  if (min && v < Number(min)) return false;
  if (max && v > Number(max)) return false;
  return true;
}

export function filterAndSortKeywords(params: {
  keywords: KeywordRow[];
  pendingSearch: string;
  filters: DomainFilterValues;
  sortMode: DomainSortMode;
  currentSortOrder: SortOrder;
}): KeywordRow[] {
  const { keywords, pendingSearch, filters, sortMode, currentSortOrder } =
    params;
  const includeTerms = parseTerms(filters.include);
  const excludeTerms = parseTerms(filters.exclude);

  const filtered = keywords.filter((row) => {
    const haystack = `${row.keyword} ${row.relativeUrl ?? ""}`.toLowerCase();

    if (
      pendingSearch &&
      !haystack.includes(pendingSearch.toLowerCase().trim())
    ) {
      return false;
    }

    if (
      includeTerms.length > 0 &&
      !includeTerms.every((term) => haystack.includes(term))
    ) {
      return false;
    }
    if (excludeTerms.some((term) => haystack.includes(term))) {
      return false;
    }

    if (
      !passesNumericFilter(row.traffic, filters.minTraffic, filters.maxTraffic)
    )
      return false;
    if (!passesNumericFilter(row.searchVolume, filters.minVol, filters.maxVol))
      return false;
    if (!passesNumericFilter(row.cpc, filters.minCpc, filters.maxCpc))
      return false;
    if (
      !passesNumericFilter(row.keywordDifficulty, filters.minKd, filters.maxKd)
    )
      return false;
    if (!passesNumericFilter(row.position, filters.minRank, filters.maxRank))
      return false;

    return true;
  });

  if (sortMode === "traffic") {
    return sortBy(filtered, [
      (row) => sortableNullableNumber(row.traffic, currentSortOrder),
      currentSortOrder,
    ]);
  }

  if (sortMode === "volume") {
    return sortBy(filtered, [
      (row) => sortableNullableNumber(row.searchVolume, currentSortOrder),
      currentSortOrder,
    ]);
  }

  if (sortMode === "score") {
    return sortBy(filtered, [
      (row) => sortableNullableNumber(row.keywordDifficulty, currentSortOrder),
      currentSortOrder,
    ]);
  }

  if (sortMode === "cpc") {
    return sortBy(filtered, [
      (row) => sortableNullableNumber(row.cpc, currentSortOrder),
      currentSortOrder,
    ]);
  }

  return sortBy(filtered, [
    (row) => sortableNullableNumber(row.position, currentSortOrder),
    currentSortOrder,
  ]);
}
