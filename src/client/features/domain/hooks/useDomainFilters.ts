import { useCallback } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import {
  EMPTY_DOMAIN_FILTERS,
  type DomainFilterValues,
} from "@/client/features/domain/types";

export function useDomainFilters() {
  const filtersForm = useForm({
    defaultValues: EMPTY_DOMAIN_FILTERS,
  });

  const values = useStore(filtersForm.store, (s) => s.values);

  const resetFilters = useCallback(() => {
    const keys: Array<keyof DomainFilterValues> = [
      "include",
      "exclude",
      "minTraffic",
      "maxTraffic",
      "minVol",
      "maxVol",
      "minCpc",
      "maxCpc",
      "minKd",
      "maxKd",
      "minRank",
      "maxRank",
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
