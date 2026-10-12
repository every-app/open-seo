import { useCallback, useEffect, useState } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import {
  EMPTY_QUERIES_FILTERS,
  EMPTY_TOP_PAGES_FILTERS,
  type QueriesFilterValues,
  type TopPagesFilterValues,
} from "./brandLookupFilterTypes";
import { countActiveFilters } from "./brandLookupFiltering";

// v3: the pages tab returned to provider page-level metrics after a brief
// sampled-prompt scale. Bump the prefix so local min/max filters do not carry
// between incompatible metric scales.
const STORAGE_KEY_PREFIX = "brand-lookup-filters-v3:";

type FilterValues = Record<string, string>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function storageKey(projectId: string, tab: string) {
  return `${STORAGE_KEY_PREFIX}${projectId}:${tab}`;
}

function loadFromStorage<T extends FilterValues>(
  storageItem: string,
  fallback: T,
): T {
  const fallbackClone = { ...fallback };

  try {
    const raw = localStorage.getItem(storageItem);
    if (!raw) return fallbackClone;

    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return fallbackClone;

    const result = { ...fallbackClone };
    for (const key in fallback) {
      const value = parsed[key];
      if (typeof value === "string") {
        Object.assign(result, { [key]: value });
      }
    }

    return result;
  } catch {
    return fallbackClone;
  }
}

function saveToStorage(key: string, values: FilterValues) {
  try {
    localStorage.setItem(key, JSON.stringify(values));
  } catch {
    // storage full - silently ignore
  }
}

function useTabFilters<T extends FilterValues>(key: string, emptyValues: T) {
  const [defaultValues] = useState<T>(() =>
    loadFromStorage(key, { ...emptyValues }),
  );
  const form = useForm({ defaultValues });
  const values = useStore(form.store, (state) => state.values);

  useEffect(() => {
    saveToStorage(key, values);
  }, [key, values]);

  const reset = useCallback(() => {
    form.reset({ ...emptyValues }, { keepDefaultValues: true });
  }, [emptyValues, form]);

  return {
    form,
    values,
    reset,
    activeFilterCount: countActiveFilters(values),
  };
}

export function useBrandLookupFilters(projectId: string) {
  const [showFilters, setShowFilters] = useState(false);

  const pages = useTabFilters<TopPagesFilterValues>(
    storageKey(projectId, "pages"),
    EMPTY_TOP_PAGES_FILTERS,
  );
  const queries = useTabFilters<QueriesFilterValues>(
    storageKey(projectId, "queries"),
    EMPTY_QUERIES_FILTERS,
  );

  return {
    pages,
    queries,
    showFilters,
    setShowFilters,
  };
}

export type BrandLookupFiltersState = ReturnType<typeof useBrandLookupFilters>;
