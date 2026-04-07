import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { usePreferredKeywordLocation } from "@/client/features/keywords/hooks/usePreferredKeywordLocation";
import { saveKeywords } from "@/serverFunctions/keywords";
import type { SaveKeywordsInput } from "@/types/schemas/keywords";
import type { KeywordResearchRow } from "@/types/keywords";
import type { KeywordResearchControllerInput } from "./useKeywordResearchController";

export function useResolvedKeywordLocation(
  input: KeywordResearchControllerInput,
) {
  const { preferredLocationCode, setPreferredLocationCode } =
    usePreferredKeywordLocation();
  const locationCode =
    !input.hasExplicitLocationCode && input.keywordInput === ""
      ? preferredLocationCode
      : input.locationCode;

  return { locationCode, setPreferredLocationCode };
}

export function useKeywordUiState() {
  const [showFilters, setShowFilters] = useState(false);
  const [selectedKeyword, setSelectedKeyword] =
    useState<KeywordResearchRow | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [mobileTab, setMobileTab] = useState<"keywords" | "serp">("keywords");

  return {
    mobileTab,
    selectedKeyword,
    setMobileTab,
    setSelectedKeyword,
    setShowFilters,
    setShowSaveDialog,
    showFilters,
    showSaveDialog,
  };
}

export function useKeywordSearchParams() {
  const navigate = useNavigate({ from: "/p/$projectId/keywords" });

  return (updates: Record<string, string | number | boolean | undefined>) => {
    void navigate({
      search: (prev) => ({ ...prev, ...updates }),
      replace: true,
    });
  };
}

export function useKeywordSaveMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SaveKeywordsInput) => saveKeywords({ data }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["savedKeywords", projectId],
      });
    },
  });
}
