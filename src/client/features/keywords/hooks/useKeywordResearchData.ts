import { useRef, useState } from "react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import { LOCATIONS, getLanguageCode } from "@/client/features/keywords/utils";
import { DEFAULT_LOCATION_CODE } from "@/client/features/keywords/locations";
import { researchKeywords } from "@/serverFunctions/keywords";
import type {
  KeywordMode,
  KeywordSource,
  ResultLimit,
} from "@/client/features/keywords/keywordResearchTypes";
import type { KeywordResearchRow } from "@/types/keywords";

type AddSearchFn = (
  keyword: string,
  locationCode: number,
  locationName: string,
) => void;

export function useKeywordResearchData(addSearch: AddSearchFn) {
  const [rows, setRows] = useState<KeywordResearchRow[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [lastSearchError, setLastSearchError] = useState(false);
  const [lastResultSource, setLastResultSource] =
    useState<KeywordSource>("related");
  const [lastUsedFallback, setLastUsedFallback] = useState(false);
  const [lastSearchKeyword, setLastSearchKeyword] = useState("");
  const [lastSearchLocationCode, setLastSearchLocationCode] = useState(
    DEFAULT_LOCATION_CODE,
  );
  const [researchError, setResearchError] = useState<string | null>(null);
  const [researchMutationError, setResearchMutationError] =
    useState<unknown>(null);
  const [searchedKeyword, setSearchedKeyword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  // Sequence token so a stale fetch (e.g. user fired a second search before
  // the first resolved) can't overwrite state that belongs to a newer one.
  const requestSeqRef = useRef(0);

  const beginSearch = (seedKeyword: string, locationCode: number) => {
    setResearchError(null);
    setResearchMutationError(null);
    setHasSearched(true);
    setLastSearchError(false);
    setSearchedKeyword(seedKeyword);
    setLastSearchKeyword(seedKeyword);
    setLastSearchLocationCode(locationCode);
    setIsLoading(true);
  };

  const resetResearch = () => {
    setRows([]);
    setHasSearched(false);
    setLastSearchError(false);
    setLastResultSource("related");
    setLastUsedFallback(false);
    setLastSearchKeyword("");
    setLastSearchLocationCode(DEFAULT_LOCATION_CODE);
    setResearchError(null);
    setResearchMutationError(null);
    setSearchedKeyword("");
    setIsLoading(false);
  };

  const runSearch = async (
    input: {
      projectId: string;
      keywords: string[];
      locationCode: number;
      resultLimit: ResultLimit;
      mode: KeywordMode;
    },
    handlers?: {
      onSuccess?: (seedKeyword: string, rows: KeywordResearchRow[]) => void;
      onError?: () => void;
    },
  ) => {
    const seedKeyword = input.keywords[0] ?? "";
    const languageCode = getLanguageCode(input.locationCode);
    const requestSeq = ++requestSeqRef.current;
    const isStale = () => requestSeqRef.current !== requestSeq;

    try {
      const result = await researchKeywords({
        data: {
          keywords: input.keywords,
          projectId: input.projectId,
          locationCode: input.locationCode,
          languageCode,
          resultLimit: input.resultLimit,
          mode: input.mode,
        },
      });

      if (isStale()) return;

      setResearchError(null);
      setResearchMutationError(null);
      setRows(result.rows);
      setLastResultSource(result.source);
      setLastUsedFallback(result.usedFallback);

      captureClientEvent("keyword_research:search_complete", {
        location_code: input.locationCode,
        search_mode: input.mode,
        result_count: result.rows.length,
      });

      if (seedKeyword) {
        addSearch(
          seedKeyword,
          input.locationCode,
          LOCATIONS[input.locationCode] || "Unknown",
        );
      }

      handlers?.onSuccess?.(seedKeyword, result.rows);
    } catch (error) {
      if (isStale()) return;
      setLastSearchError(true);
      setRows([]);
      setResearchMutationError(error);
      setResearchError(getStandardErrorMessage(error, "Research failed."));
      handlers?.onError?.();
    } finally {
      if (!isStale()) setIsLoading(false);
    }
  };

  return {
    rows,
    hasSearched,
    lastSearchError,
    lastResultSource,
    lastUsedFallback,
    lastSearchKeyword,
    lastSearchLocationCode,
    researchError,
    researchMutationError,
    searchedKeyword,
    isLoading,
    beginSearch,
    resetResearch,
    runSearch,
  };
}
