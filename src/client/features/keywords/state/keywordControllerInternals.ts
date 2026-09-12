import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { usePreferredKeywordLocation } from "@/client/features/keywords/hooks/usePreferredKeywordLocation";
import { useProjectMarket } from "@/client/features/projects/useProjectMarket";
import { saveKeywords } from "@/serverFunctions/keywords";
import { globalTraceStore } from "@/client/features/tracing/globalTraceStore";
import type { SaveKeywordsInput } from "@/types/schemas/keywords";
import type { KeywordResearchRow } from "@/types/keywords";

export function useResolvedKeywordLocation(input: {
  projectId: string;
  locationCode?: number;
}) {
  const projectMarket = useProjectMarket(input.projectId);
  const {
    preferredLocationCode,
    selectedLocationCode,
    setPreferredLocationCode,
  } = usePreferredKeywordLocation(input.projectId, projectMarket?.locationCode);
  const locationCode = input.locationCode ?? selectedLocationCode;
  const displayedLocationCode = input.locationCode ?? preferredLocationCode;

  return { locationCode, displayedLocationCode, setPreferredLocationCode };
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
    mutationFn: async (data: SaveKeywordsInput) => {
      const opId = globalTraceStore.startOperation({
        feature: "saved_keywords",
        operation: "saved_keywords.save",
        source: "Keyword Research page",
        projectId,
        status: "running",
        billing: "Free",
        metered: false,
        budget: "PASS",
        cache: "Not applicable",
        provider: "Internal",
        selectedCount: data.keywords.length,
        metadata: { count: data.keywords.length },
      });

      try {
        const result = await saveKeywords({ data });
        globalTraceStore.completeOperation(opId, {
          status: "success",
          httpStatus: 200,
          providerCalls: 1,
          providerBreakdown: [{ provider: "Internal", count: 1 }],
          providers: [
            {
              provider: "Internal",
              httpStatus: 200,
              transport: "HTTP",
              billing: "Free",
              metered: false,
              budgetGuard: "PASS",
            },
          ],
        });
        return result;
      } catch (err) {
        globalTraceStore.completeOperation(opId, {
          status: "failed",
          httpStatus: 500,
          errorMessage:
            err instanceof Error ? err.message : "Failed to save keywords",
        });
        throw err;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["savedKeywords", projectId],
      });
    },
  });
}
