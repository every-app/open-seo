import { useCallback, useEffect, useState } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import {
  EMPTY_BACKLINKS_FILTERS,
  EMPTY_REFERRING_DOMAINS_FILTERS,
  EMPTY_TOP_PAGES_FILTERS,
  type BacklinksTabFilterValues,
  type ReferringDomainsFilterValues,
  type TopPagesFilterValues,
} from "./backlinksFilterTypes";
import { countActiveFilters } from "./backlinksFiltering";

const STORAGE_KEY_PREFIX = "backlinks-filters:";

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

export function useBacklinksFilters() {
  const [showFilters, setShowFilters] = useState(false);

  const backlinks = useTabFilters<BacklinksTabFilterValues>(
    "backlinks",
    EMPTY_BACKLINKS_FILTERS,
  );
  const domains = useTabFilters<ReferringDomainsFilterValues>(
    "domains",
    EMPTY_REFERRING_DOMAINS_FILTERS,
  );
  const pages = useTabFilters<TopPagesFilterValues>(
    "pages",
    EMPTY_TOP_PAGES_FILTERS,
  );

  return {
    backlinks,
    domains,
    pages,
    showFilters,
    setShowFilters,
  };
}

export type BacklinksFiltersState = ReturnType<typeof useBacklinksFilters>;
