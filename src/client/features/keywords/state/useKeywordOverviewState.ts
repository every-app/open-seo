import { useMemo } from "react";
import type { KeywordMode } from "@/client/features/keywords/keywordResearchTypes";
import type { KeywordResearchRow } from "@/types/keywords";

export function useKeywordOverviewState({
  rows,
  searchedKeyword,
  selectedKeyword,
  hasSearched,
  isLoading,
  lastSearchError,
  keywordMode,
}: {
  rows: KeywordResearchRow[];
  searchedKeyword: string;
  selectedKeyword: KeywordResearchRow | null;
  hasSearched: boolean;
  isLoading: boolean;
  lastSearchError: boolean;
  keywordMode: KeywordMode;
}) {
  const hasExactMatchInResults = useMemo(() => {
    const normalizedSeed = searchedKeyword.trim().toLowerCase();
    if (!normalizedSeed || rows.length === 0) return false;
    return rows.some(
      (row) => row.keyword.trim().toLowerCase() === normalizedSeed,
    );
  }, [rows, searchedKeyword]);

  const showApproximateMatchNotice =
    hasSearched &&
    !isLoading &&
    !lastSearchError &&
    rows.length > 0 &&
    searchedKeyword.trim() !== "" &&
    !hasExactMatchInResults &&
    keywordMode !== "auto";

  const overviewKeyword: KeywordResearchRow | null = useMemo(() => {
    if (selectedKeyword) return selectedKeyword;
    if (searchedKeyword && rows.length > 0) {
      const seed = rows.find(
        (row) => row.keyword.toLowerCase() === searchedKeyword.toLowerCase(),
      );
      if (seed) return seed;
    }
    return rows.length > 0 ? rows[0] : null;
  }, [selectedKeyword, searchedKeyword, rows]);

  return { showApproximateMatchNotice, overviewKeyword };
}
