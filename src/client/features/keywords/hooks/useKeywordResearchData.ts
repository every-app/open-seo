import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import { LOCATIONS } from "@/client/features/keywords/utils";
import { formatLocationLabel } from "@/shared/keyword-locations";
import { parseKeywordInput } from "@/client/features/keywords/state/keywordControllerActions";
import { researchKeywords } from "@/serverFunctions/keywords";
import type {
  KeywordMode,
  ResultLimit,
} from "@/client/features/keywords/keywordResearchTypes";

type AddSearchFn = (
  keyword: string,
  locationCode: number,
  locationLabel: string,
  localLocationName: string | undefined,
) => void;

type KeywordResearchRequestInput = {
  projectId: string;
  keywordInput: string;
  locationCode: number | undefined;
  locationName: string | undefined;
  resultLimit: ResultLimit;
  mode: KeywordMode;
  clickstream: boolean;
  groupKeywords: boolean;
};

type KeywordResearchQueryInput = KeywordResearchRequestInput & {
  displayedLocationCode: number;
};

type KeywordResearchRequest = {
  projectId: string;
  keywords: string[];
  seedKeyword: string;
  locationCode: number | undefined;
  locationName: string | undefined;
  resultLimit: ResultLimit;
  mode: KeywordMode;
  clickstream: boolean;
  groupKeywords: boolean;
};

export const KEYWORD_RESEARCH_STALE_TIME_MS = 24 * 60 * 60 * 1000;

export function buildKeywordResearchRequest(
  input: KeywordResearchRequestInput,
): KeywordResearchRequest | null {
  const keywords = parseKeywordInput(input.keywordInput);
  const seedKeyword = keywords[0] ?? "";
  if (!seedKeyword) return null;

  return {
    projectId: input.projectId,
    keywords,
    seedKeyword,
    locationCode: input.locationCode,
    locationName: input.locationName,
    resultLimit: input.resultLimit,
    mode: input.mode,
    clickstream: input.clickstream,
    groupKeywords: input.groupKeywords,
  };
}

export function buildKeywordResearchQueryKey(
  request: KeywordResearchRequest | null,
) {
  return request
    ? [
        "keywordResearch",
        request.projectId,
        request.keywords,
        request.locationCode,
        request.locationName,
        request.resultLimit,
        request.mode,
        request.clickstream,
        request.groupKeywords,
      ]
    : ["keywordResearch", "idle"];
}

export function keywordResearchQueryFn(request: KeywordResearchRequest) {
  return researchKeywords({
    data: {
      projectId: request.projectId,
      keywords: request.keywords,
      locationCode: request.locationCode,
      locationName: request.locationName,
      resultLimit: request.resultLimit,
      mode: request.mode,
      clickstream: request.clickstream,
      groupKeywords: request.groupKeywords,
    },
  });
}

export function useKeywordResearchData(
  input: KeywordResearchQueryInput,
  addSearch: AddSearchFn,
) {
  const {
    clickstream,
    groupKeywords,
    displayedLocationCode,
    keywordInput,
    locationCode,
    locationName,
    mode,
    projectId,
    resultLimit,
  } = input;
  const request = useMemo<KeywordResearchRequest | null>(
    () =>
      buildKeywordResearchRequest({
        keywordInput,
        locationCode,
        locationName,
        mode,
        projectId,
        resultLimit,
        clickstream,
        groupKeywords,
      }),
    [
      clickstream,
      groupKeywords,
      keywordInput,
      locationCode,
      locationName,
      mode,
      projectId,
      resultLimit,
    ],
  );
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

      return keywordResearchQueryFn(request);
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
      location_code: displayedLocationCode,
      search_mode: request.mode,
      clickstream: request.clickstream,
      local: request.locationName !== undefined,
      result_count: researchQuery.data.rows.length,
    });

    addSearch(
      request.seedKeyword,
      displayedLocationCode,
      request.locationName
        ? formatLocationLabel(request.locationName)
        : LOCATIONS[displayedLocationCode] || "Unknown",
      request.locationName,
    );
  }, [
    addSearch,
    displayedLocationCode,
    queryKeyString,
    request,
    researchQuery.data,
    researchQuery.isSuccess,
  ]);

  const hasSearched = parseKeywordInput(keywordInput).length > 0;
  const rows = hasSearched ? (researchQuery.data?.rows ?? []) : [];
  const researchError =
    hasSearched && researchQuery.isError
      ? getStandardErrorMessage(researchQuery.error, "Research failed.")
      : null;

  return {
    rows,
    hasSearched,
    lastSearchError: hasSearched && researchQuery.isError,
    lastSearchKeyword: request?.seedKeyword ?? "",
    lastSearchLocationCode: displayedLocationCode,
    researchError,
    researchMutationError: researchQuery.error,
    searchedKeyword: request?.seedKeyword ?? "",
    isLoading: hasSearched && researchQuery.isPending,
    researchQuery,
    retryResearch: researchQuery.refetch,
  };
}
