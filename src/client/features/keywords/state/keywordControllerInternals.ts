import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { usePreferredKeywordLocation } from "@/client/features/keywords/hooks/usePreferredKeywordLocation";
import { saveKeywords } from "@/serverFunctions/keywords";
import { getProjects } from "@/serverFunctions/projects";
import type { SaveKeywordsInput } from "@/types/schemas/keywords";
import type { KeywordResearchRow } from "@/types/keywords";
import type { KeywordResearchControllerInput } from "./useKeywordResearchController";

export function useResolvedKeywordLocation(
  input: KeywordResearchControllerInput,
) {
  // Seed the picker from the project's default market (cached under
  // ["projects"], shared with the switcher/settings) until the user picks one.
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
  });
  const projectDefaultLocationCode = projectsQuery.data?.find(
    (project) => project.id === input.projectId,
  )?.locationCode;
  const { preferredLocationCode, setPreferredLocationCode } =
    usePreferredKeywordLocation(projectDefaultLocationCode);
  const locationCode =
    !input.hasExplicitLocationCode && input.keywordInput === ""
      ? preferredLocationCode
      : input.locationCode;

  return { locationCode, setPreferredLocationCode };
}

export function useKeywordUiState(initialShowFilters: boolean) {
  const [showFilters, setShowFilters] = useState(initialShowFilters);
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

  return useCallback(
    (updates: Record<string, string | number | boolean | undefined>) => {
      void navigate({
        search: (prev) => ({ ...prev, ...updates }),
        replace: true,
      });
    },
    [navigate],
  );
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
