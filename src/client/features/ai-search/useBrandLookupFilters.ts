import { useCallback, useEffect, useState } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import {
  EMPTY_QUERIES_FILTERS,
  EMPTY_TOP_PAGES_FILTERS,
  type QueriesFilterValues,
  type TopPagesFilterValues,
} from "./brandLookupFilterTypes";
import { countActiveFilters } from "./brandLookupFiltering";

const STORAGE_KEY_PREFIX = "brand-lookup-filters:";

type FilterValues = Record<string, string>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function loadFromStorage<T extends FilterValues>(tab: string, fallback: T): T {
  const fallbackClone = { ...fallback };

  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${tab}`);
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

function saveToStorage(tab: string, values: FilterValues) {
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${tab}`, JSON.stringify(values));
  } catch {
    // storage full - silently ignore
  }
}

function useTabFilters<T extends FilterValues>(tab: string, emptyValues: T) {
  const [defaultValues] = useState<T>(() =>
    loadFromStorage(tab, { ...emptyValues }),
  );
  const form = useForm({ defaultValues });
  const values = useStore(form.store, (state) => state.values);

  useEffect(() => {
    saveToStorage(tab, values);
  }, [tab, values]);

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

export function useBrandLookupFilters() {
  const [showFilters, setShowFilters] = useState(false);

  const pages = useTabFilters<TopPagesFilterValues>(
    "pages",
    EMPTY_TOP_PAGES_FILTERS,
  );
  const queries = useTabFilters<QueriesFilterValues>(
    "queries",
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
