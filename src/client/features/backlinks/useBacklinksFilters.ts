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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function loadFromStorage<T extends Record<string, string>>(
  tab: string,
  fallback: T,
): T {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${tab}`);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return fallback;
    const result = { ...fallback };
    for (const key of Object.keys(fallback)) {
      const val = parsed[key];
      if (typeof val === "string") {
        (result as Record<string, string>)[key] = val;
      }
    }
    return result;
  } catch {
    return fallback;
  }
}

function saveToStorage(tab: string, values: Record<string, string>) {
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${tab}`, JSON.stringify(values));
  } catch {
    // storage full — silently ignore
  }
}

function useTabFilterForm<T extends Record<string, string>>(
  tab: string,
  emptyValues: T,
) {
  const form = useForm({ defaultValues: loadFromStorage(tab, emptyValues) });
  const values = useStore(form.store, (s) => s.values);

  useEffect(() => {
    saveToStorage(tab, values);
  }, [tab, values]);

  const reset = useCallback(() => {
    form.reset(emptyValues);
  }, [form, emptyValues]);

  const activeFilterCount = countActiveFilters(values);

  return { form, values, reset, activeFilterCount };
}

export function useBacklinksFilters() {
  const [showFilters, setShowFilters] = useState(false);

  const backlinks = useTabFilterForm<BacklinksTabFilterValues>(
    "backlinks",
    EMPTY_BACKLINKS_FILTERS,
  );
  const domains = useTabFilterForm<ReferringDomainsFilterValues>(
    "domains",
    EMPTY_REFERRING_DOMAINS_FILTERS,
  );
  const pages = useTabFilterForm<TopPagesFilterValues>(
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
