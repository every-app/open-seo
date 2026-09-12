import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import { LOCATIONS } from "@/client/features/keywords/utils";
import { parseKeywordInput } from "@/client/features/keywords/state/keywordControllerActions";
import { researchKeywords } from "@/serverFunctions/keywords";
import { globalTraceStore } from "@/client/features/tracing/globalTraceStore";
import type {
  KeywordMode,
  ResearchSource,
  ResultLimit,
} from "@/client/features/keywords/keywordResearchTypes";

type AddSearchFn = (
  keyword: string,
  locationCode: number,
  locationName: string,
) => void;

type KeywordResearchRequestInput = {
  projectId: string;
  keywordInput: string;
  locationCode: number | undefined;
  resultLimit: ResultLimit;
  mode: KeywordMode;
  clickstream: boolean;
};

type KeywordResearchQueryInput = KeywordResearchRequestInput & {
  displayedLocationCode: number;
};

type KeywordResearchRequest = {
  projectId: string;
  keywords: string[];
  seedKeyword: string;
  locationCode: number | undefined;
  resultLimit: ResultLimit;
  mode: KeywordMode;
  clickstream: boolean;
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
    resultLimit: input.resultLimit,
    mode: input.mode,
    clickstream: input.clickstream,
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
        request.resultLimit,
        request.mode,
        request.clickstream,
      ]
    : ["keywordResearch", "idle"];
}

export async function keywordResearchQueryFn(request: KeywordResearchRequest) {
  const opId = globalTraceStore.startOperation({
    feature: "keyword_research",
    operation: "keyword_research.research",
    source: "Keyword Research page",
    projectId: request.projectId,
    status: "running",
    billing: "Paid",
    metered: true,
    budget: "PASS",
    cache: "Not applicable",
    provider: "DataForSEO",
    metadata: {
      keywords: request.keywords,
      mode: request.mode,
      locationCode: request.locationCode,
    },
  });

  try {
    const result = await researchKeywords({
      data: {
        projectId: request.projectId,
        keywords: request.keywords,
        locationCode: request.locationCode,
        resultLimit: request.resultLimit,
        mode: request.mode,
        clickstream: request.clickstream,
      },
    });

    globalTraceStore.completeOperation(opId, {
      status: "success",
      httpStatus: 200,
      providerCalls: 1,
      providerBreakdown: [{ provider: "DataForSEO", count: 1 }],
      providers: [
        {
          provider: "DataForSEO",
          endpoint: "v3/dataforseo_labs/google/keyword_suggestions/live",
          httpStatus: 200,
          taskStatus: 20000,
          transport: "HTTP",
          billing: "Paid",
          metered: true,
          budgetGuard: "PASS",
        },
      ],
      counters: {
        results: result?.rows?.length ?? 0,
      },
    });

    return result;
  } catch (error) {
    globalTraceStore.completeOperation(opId, {
      status: "failed",
      httpStatus: 500,
      errorMessage:
        error instanceof Error ? error.message : "Keyword research failed",
    });
    throw error;
  }
}

export function useKeywordResearchData(
  input: KeywordResearchQueryInput,
  addSearch: AddSearchFn,
) {
  const {
    clickstream,
    displayedLocationCode,
    keywordInput,
    locationCode,
    mode,
    projectId,
    resultLimit,
  } = input;
  const request = useMemo<KeywordResearchRequest | null>(
    () =>
      buildKeywordResearchRequest({
        keywordInput,
        locationCode,
        mode,
        projectId,
        resultLimit,
        clickstream,
      }),
    [clickstream, keywordInput, locationCode, mode, projectId, resultLimit],
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
      result_count: researchQuery.data.rows.length,
    });

    addSearch(
      request.seedKeyword,
      displayedLocationCode,
      LOCATIONS[displayedLocationCode] || "Unknown",
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
    lastResultSource:
      researchQuery.data?.source ?? ("related" as ResearchSource),
    lastUsedFallback: researchQuery.data?.usedFallback ?? false,
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
