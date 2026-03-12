import { useCallback } from "react";
import { useForm } from "@tanstack/react-form";
import {
  EMPTY_FILTERS,
  type KeywordFilterValues,
} from "@/client/features/keywords/keywordResearchTypes";

export function useLocalKeywordFilters() {
  const filtersForm = useForm({
    defaultValues: EMPTY_FILTERS,
  });

  const values = filtersForm.state.values;
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
