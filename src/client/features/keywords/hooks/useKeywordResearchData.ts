import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import { LOCATIONS, getLanguageCode } from "@/client/features/keywords/utils";
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
  const [lastSearchLocationCode, setLastSearchLocationCode] = useState(2840);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [searchedKeyword, setSearchedKeyword] = useState("");

  const researchMutation = useMutation({
    mutationFn: (data: {
      projectId: string;
      keywords: string[];
      locationCode: number;
      languageCode: string;
      resultLimit: ResultLimit;
      mode: KeywordMode;
    }) => researchKeywords({ data }),
  });

  const beginSearch = (seedKeyword: string, locationCode: number) => {
    setResearchError(null);
    setHasSearched(true);
    setLastSearchError(false);
    setSearchedKeyword(seedKeyword);
    setLastSearchKeyword(seedKeyword);
    setLastSearchLocationCode(locationCode);
  };

  const resetResearch = () => {
    setRows([]);
    setHasSearched(false);
    setLastSearchError(false);
    setLastResultSource("related");
    setLastUsedFallback(false);
    setLastSearchKeyword("");
    setLastSearchLocationCode(2840);
    setResearchError(null);
    setSearchedKeyword("");
  };

  const runSearch = (
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

    researchMutation.mutate(
      {
        keywords: input.keywords,
        projectId: input.projectId,
        locationCode: input.locationCode,
        languageCode,
        resultLimit: input.resultLimit,
        mode: input.mode,
      },
      {
        onSuccess: (result) => {
          const resultCount = result.rows.length;

          setResearchError(null);
          setRows(result.rows);
          setLastResultSource(result.source);
          setLastUsedFallback(result.usedFallback);

          captureClientEvent("keyword_research:search_complete", {
            location_code: input.locationCode,
            search_mode: input.mode,
            result_count: resultCount,
          });

          if (seedKeyword) {
            addSearch(
              seedKeyword,
              input.locationCode,
              LOCATIONS[input.locationCode] || "Unknown",
            );
          }

          handlers?.onSuccess?.(seedKeyword, result.rows);
        },
        onError: (error) => {
          setLastSearchError(true);
          setRows([]);
          setResearchError(getStandardErrorMessage(error, "Research failed."));
          handlers?.onError?.();
        },
      },
    );
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
    researchMutationError: researchMutation.error,
    searchedKeyword,
    isLoading: researchMutation.isPending,
    beginSearch,
    resetResearch,
    runSearch,
  };
}
