import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
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

type AddSearchFn = (
  keyword: string,
  locationCode: number,
  locationName: string,
) => void;

type KeywordResearchQueryInput = {
  projectId: string;
  keywordInput: string;
  locationCode: number;
  resultLimit: ResultLimit;
  mode: KeywordMode;
};

type KeywordResearchRequest = {
  projectId: string;
  keywords: string[];
  seedKeyword: string;
  locationCode: number;
  languageCode: string;
  resultLimit: ResultLimit;
  mode: KeywordMode;
};

const KEYWORD_RESEARCH_STALE_TIME_MS = 24 * 60 * 60 * 1000;

function parseSearchKeywords(value: string) {
  return value
    .split(/[\n,]/)
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

function buildKeywordResearchQueryKey(request: KeywordResearchRequest | null) {
  return request
    ? [
        "keywordResearch",
        request.projectId,
        request.keywords,
        request.locationCode,
        request.languageCode,
        request.resultLimit,
        request.mode,
      ]
    : ["keywordResearch", "idle"];
}

export function useKeywordResearchData(
  input: KeywordResearchQueryInput,
  addSearch: AddSearchFn,
) {
  const keywords = useMemo(
    () => parseSearchKeywords(input.keywordInput),
    [input.keywordInput],
  );
  const request = useMemo<KeywordResearchRequest | null>(() => {
    const seedKeyword = keywords[0] ?? "";
    if (!seedKeyword) return null;

    return {
      projectId: input.projectId,
      keywords,
      seedKeyword,
      locationCode: input.locationCode,
      languageCode: getLanguageCode(input.locationCode),
      resultLimit: input.resultLimit,
      mode: input.mode,
    };
  }, [
    input.locationCode,
    input.mode,
    input.projectId,
    input.resultLimit,
    keywords,
  ]);
  const queryKey = useMemo(
    () => buildKeywordResearchQueryKey(request),
    [request],
  );
  const queryKeyString = JSON.stringify(queryKey);

  const researchQuery = useQuery({
    queryKey,
    queryFn: () => {
      if (!request) {
        throw new Error("Keyword research query ran without request params");
      }

      return researchKeywords({
        data: {
          projectId: request.projectId,
          keywords: request.keywords,
          locationCode: request.locationCode,
          languageCode: request.languageCode,
          resultLimit: request.resultLimit,
          mode: request.mode,
        },
      });
    },
    enabled: request !== null,
    staleTime: KEYWORD_RESEARCH_STALE_TIME_MS,
    gcTime: KEYWORD_RESEARCH_STALE_TIME_MS,
    retry: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  const handledSuccessKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!request || !researchQuery.isSuccess || !researchQuery.data) return;
    if (handledSuccessKeyRef.current === queryKeyString) return;
    handledSuccessKeyRef.current = queryKeyString;

    captureClientEvent("keyword_research:search_complete", {
      location_code: request.locationCode,
      search_mode: request.mode,
      result_count: researchQuery.data.rows.length,
    });

    addSearch(
      request.seedKeyword,
      request.locationCode,
      LOCATIONS[request.locationCode] || "Unknown",
    );
  }, [
    addSearch,
    queryKeyString,
    request,
    researchQuery.data,
    researchQuery.isSuccess,
  ]);

  const hasSearched = request !== null;
  const rows = hasSearched ? (researchQuery.data?.rows ?? []) : [];
  const researchError =
    hasSearched && researchQuery.isError
      ? getStandardErrorMessage(researchQuery.error, "Research failed.")
      : null;

  return {
    rows,
    hasSearched,
    lastSearchError: hasSearched && researchQuery.isError,
    lastResultSource:
      researchQuery.data?.source ?? ("related" as KeywordSource),
    lastUsedFallback: researchQuery.data?.usedFallback ?? false,
    lastSearchKeyword: request?.seedKeyword ?? "",
    lastSearchLocationCode: request?.locationCode ?? DEFAULT_LOCATION_CODE,
    researchError,
    researchMutationError: researchQuery.error,
    searchedKeyword: request?.seedKeyword ?? "",
    isLoading: hasSearched && researchQuery.isPending,
    researchQuery,
    retryResearch: researchQuery.refetch,
  };
}
