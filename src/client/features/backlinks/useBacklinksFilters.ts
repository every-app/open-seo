import { useCallback, useState } from "react";
import { MAX_DATAFORSEO_FILTER_CONDITIONS } from "@/types/schemas/domain";
import {
  EMPTY_BACKLINKS_FILTERS,
  EMPTY_REFERRING_DOMAINS_FILTERS,
  EMPTY_TOP_PAGES_FILTERS,
  countActiveFilters,
  countFilterConditions,
  type BacklinksTabFilterValues,
  type ReferringDomainsFilterValues,
  type TopPagesFilterValues,
} from "./backlinksFilterTypes";

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

    // Filters persisted before the server-side-filtering change had no
    // condition budget; values over the DataForSEO cap would fail every
    // query on load, so start fresh instead.
    if (countFilterConditions(result) > MAX_DATAFORSEO_FILTER_CONDITIONS) {
      return fallbackClone;
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

/**
 * Holds the *applied* filters for one tab. Draft edits live inside the filter
 * panel; values here are what the server queries use, persisted per tab.
 */
function useTabFilters<T extends FilterValues>(tab: string, emptyValues: T) {
  const [values, setValues] = useState<T>(() =>
    loadFromStorage(tab, { ...emptyValues }),
  );

  const apply = useCallback(
    (next: T) => {
      setValues(next);
      saveToStorage(tab, next);
    },
    [tab],
  );

  const reset = useCallback(() => {
    apply({ ...emptyValues });
  }, [apply, emptyValues]);

  return {
    values,
    apply,
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
