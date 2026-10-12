import { useCallback, useEffect } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import { z } from "zod";
import {
  EMPTY_FILTERS,
  type KeywordFilterValues,
} from "@/client/features/keywords/keywordResearchTypes";

function storageKey(projectId: string) {
  return `keyword-default-filters:${projectId}`;
}

export const filterValuesSchema = z.object({
  include: z.string(),
  exclude: z.string(),
  minVol: z.string(),
  maxVol: z.string(),
  minCpc: z.string(),
  maxCpc: z.string(),
  minKd: z.string(),
  maxKd: z.string(),
  // Defaulted so filter blobs persisted before the intent filter existed still
  // parse (missing key -> "") instead of discarding the user's saved filters.
  intents: z.string().default(""),
});

function loadFiltersFromStorage(projectId: string): KeywordFilterValues {
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    if (!raw) return EMPTY_FILTERS;
    return filterValuesSchema.parse(JSON.parse(raw));
  } catch {
    return EMPTY_FILTERS;
  }
}

function saveFiltersToStorage(projectId: string, filters: KeywordFilterValues) {
  try {
    const hasAnyFilter = Object.values(filters).some((v) => v.trim() !== "");
    if (hasAnyFilter) {
      localStorage.setItem(storageKey(projectId), JSON.stringify(filters));
    } else {
      localStorage.removeItem(storageKey(projectId));
    }
  } catch {
    // storage full or unavailable
  }
}

export function useLocalKeywordFilters(projectId: string) {
  const filtersForm = useForm({
    defaultValues: loadFiltersFromStorage(projectId),
  });

  const values = useStore(filtersForm.store, (s) => s.values);

  useEffect(() => {
    saveFiltersToStorage(projectId, values);
  }, [projectId, values]);

  const resetFilters = useCallback(() => {
    const keys: Array<keyof KeywordFilterValues> = [
      "include",
      "exclude",
      "minVol",
      "maxVol",
      "minCpc",
      "maxCpc",
      "minKd",
      "maxKd",
      "intents",
    ];

    for (const key of keys) {
      filtersForm.setFieldValue(key, "");
    }
  }, [filtersForm]);

  return {
    filtersForm,
    values,
    resetFilters,
  };
}
