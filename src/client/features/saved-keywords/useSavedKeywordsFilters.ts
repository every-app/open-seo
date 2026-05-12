import { useForm, useStore } from "@tanstack/react-form";
import { useCallback } from "react";
import {
  countActiveSavedKeywordsFilters,
  EMPTY_SAVED_KEYWORDS_FILTERS,
  type SavedKeywordsFilterValues,
} from "./savedKeywordsFilterTypes";

const FILTER_KEYS: Array<keyof SavedKeywordsFilterValues> = [
  "include",
  "exclude",
  "minVol",
  "maxVol",
  "minCpc",
  "maxCpc",
  "minKd",
  "maxKd",
];

export function useSavedKeywordsFilters() {
  const filtersForm = useForm({ defaultValues: EMPTY_SAVED_KEYWORDS_FILTERS });
  const values = useStore(filtersForm.store, (s) => s.values);
  const activeFilterCount = countActiveSavedKeywordsFilters(values);

  const resetFilters = useCallback(() => {
    for (const key of FILTER_KEYS) {
      filtersForm.setFieldValue(key, "");
    }
  }, [filtersForm]);

  return { filtersForm, values, activeFilterCount, resetFilters };
}

export type SavedKeywordsFilterForm = ReturnType<
  typeof useSavedKeywordsFilters
>["filtersForm"];
