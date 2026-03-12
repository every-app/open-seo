import { useMemo } from "react";
import { sortBy } from "remeda";
import { parseTerms } from "@/client/features/keywords/utils";
import type { KeywordResearchRow } from "@/types/keywords";
import type { KeywordFilterValues } from "@/client/features/keywords/keywordResearchTypes";
import type { SortDir, SortField } from "@/client/features/keywords/components";

function applyKeywordFiltersAndSort(params: {
  rows: KeywordResearchRow[];
  filters: KeywordFilterValues;
  sortField: SortField;
  sortDir: SortDir;
}): KeywordResearchRow[] {
  const includeTerms = parseTerms(params.filters.include);
  const excludeTerms = parseTerms(params.filters.exclude);

  const filtered = params.rows.filter((row) => {
    const haystack = row.keyword.toLowerCase();
    if (
      includeTerms.length > 0 &&
      !includeTerms.every((term) => haystack.includes(term))
    ) {
      return false;
    }
    if (excludeTerms.some((term) => haystack.includes(term))) {
      return false;
    }

    const vol = row.searchVolume ?? 0;
    const cpc = row.cpc ?? 0;
    const kd = row.keywordDifficulty ?? 0;

    if (params.filters.minVol && vol < Number(params.filters.minVol))
      return false;
    if (params.filters.maxVol && vol > Number(params.filters.maxVol))
      return false;
    if (params.filters.minCpc && cpc < Number(params.filters.minCpc))
      return false;
    if (params.filters.maxCpc && cpc > Number(params.filters.maxCpc))
      return false;
    if (params.filters.minKd && kd < Number(params.filters.minKd)) return false;
    if (params.filters.maxKd && kd > Number(params.filters.maxKd)) return false;
    return true;
  });

  if (params.sortField === "keyword") {
    return sortBy(filtered, [(row) => row.keyword, params.sortDir]);
  }
  if (params.sortField === "searchVolume") {
    return sortBy(filtered, [(row) => row.searchVolume ?? -1, params.sortDir]);
  }
  if (params.sortField === "cpc") {
    return sortBy(filtered, [(row) => row.cpc ?? -1, params.sortDir]);
  }
  if (params.sortField === "competition") {
    return sortBy(filtered, [(row) => row.competition ?? -1, params.sortDir]);
  }

  return sortBy(filtered, [
    (row) => row.keywordDifficulty ?? -1,
    params.sortDir,
  ]);
}

export function useKeywordFiltering(params: {
  rows: KeywordResearchRow[];
  filters: KeywordFilterValues;
  sortField: SortField;
  sortDir: SortDir;
}) {
  const filteredRows = useMemo(
    () =>
      applyKeywordFiltersAndSort({
        rows: params.rows,
        filters: params.filters,
        sortField: params.sortField,
        sortDir: params.sortDir,
      }),
    [params.filters, params.rows, params.sortDir, params.sortField],
  );

  const activeFilterCount = useMemo(
    () =>
      Object.values(params.filters).filter((value) => value.trim() !== "")
        .length,
    [params.filters],
  );

  return {
    filteredRows,
    activeFilterCount,
  };
}
