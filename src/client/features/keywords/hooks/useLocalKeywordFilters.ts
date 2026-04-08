import { useCallback, useEffect } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import { z } from "zod";
import {
  EMPTY_FILTERS,
  type KeywordFilterValues,
} from "@/client/features/keywords/keywordResearchTypes";

const STORAGE_KEY = "keyword-default-filters";

const filterValuesSchema = z.object({
  include: z.string(),
  exclude: z.string(),
  minVol: z.string(),
  maxVol: z.string(),
  minCpc: z.string(),
  maxCpc: z.string(),
  minKd: z.string(),
  maxKd: z.string(),
});

function loadFiltersFromStorage(): KeywordFilterValues {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_FILTERS;
    return filterValuesSchema.parse(JSON.parse(raw));
  } catch {
    return EMPTY_FILTERS;
  }
}

function saveFiltersToStorage(filters: KeywordFilterValues) {
  try {
    const hasAnyFilter = Object.values(filters).some((v) => v.trim() !== "");
    if (hasAnyFilter) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // storage full or unavailable
  }
}

export function useLocalKeywordFilters() {
  const filtersForm = useForm({
    defaultValues: loadFiltersFromStorage(),
  });

  const values = useStore(filtersForm.store, (s) => s.values);

  useEffect(() => {
    saveFiltersToStorage(values);
  }, [values]);

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
