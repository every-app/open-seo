import { useCallback, useEffect, useState } from "react";
import {
  EMPTY_DOMAIN_FILTERS,
  type KeywordsFilterValues,
  type PagesFilterValues,
} from "@/client/features/domain/types";
import {
  KEYWORD_FILTER_FIELDS,
  PAGE_FILTER_FIELDS,
} from "@/client/features/domain/domainFilterUtils";

const STORAGE_KEY_PREFIX = "domain-overview-filter-defaults:";

type DomainFilterPreferenceTab = "keywords" | "pages";
type FilterValues = Record<string, string>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasAnyFilter(values: FilterValues): boolean {
  return Object.values(values).some((value) => value.trim() !== "");
}

function getStorageKey(tab: DomainFilterPreferenceTab, scope: string): string {
  return `${STORAGE_KEY_PREFIX}${scope}:${tab}`;
}

function loadFromStorage<T extends FilterValues>(
  tab: DomainFilterPreferenceTab,
  scope: string,
  fallback: T,
): T {
  const result = { ...fallback };
  if (typeof window === "undefined") return result;

  try {
    const raw = window.localStorage.getItem(getStorageKey(tab, scope));
    if (!raw) return result;

    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return result;

    for (const key in fallback) {
      const value = parsed[key];
      if (typeof value === "string") {
        Object.assign(result, { [key]: value });
      }
    }
  } catch {
    // localStorage can be unavailable in private browsing or strict modes.
  }

  return result;
}

function saveToStorage(
  tab: DomainFilterPreferenceTab,
  scope: string,
  values: FilterValues,
) {
  if (typeof window === "undefined") return;

  try {
    const key = getStorageKey(tab, scope);
    if (hasAnyFilter(values)) {
      window.localStorage.setItem(key, JSON.stringify(values));
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // storage full or unavailable
  }
}

function clearStorage(tab: DomainFilterPreferenceTab, scope: string) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(getStorageKey(tab, scope));
  } catch {
    // storage unavailable
  }
}

function emptyPageFilters(): PagesFilterValues {
  return {
    include: EMPTY_DOMAIN_FILTERS.include,
    exclude: EMPTY_DOMAIN_FILTERS.exclude,
    minTraffic: EMPTY_DOMAIN_FILTERS.minTraffic,
    maxTraffic: EMPTY_DOMAIN_FILTERS.maxTraffic,
    minVol: EMPTY_DOMAIN_FILTERS.minVol,
    maxVol: EMPTY_DOMAIN_FILTERS.maxVol,
  };
}

function loadKeywordFilters(scope: string): KeywordsFilterValues {
  return loadFromStorage("keywords", scope, { ...EMPTY_DOMAIN_FILTERS });
}

function loadPageFilters(scope: string): PagesFilterValues {
  return loadFromStorage("pages", scope, emptyPageFilters());
}

export function useDomainKeywordFilterPreferences(scope: string) {
  const [filters, setFilters] = useState<KeywordsFilterValues>(() =>
    loadKeywordFilters(scope),
  );

  useEffect(() => {
    setFilters(loadKeywordFilters(scope));
  }, [scope]);

  const save = useCallback(
    (values: KeywordsFilterValues) => {
      const next = { ...EMPTY_DOMAIN_FILTERS };
      for (const key of KEYWORD_FILTER_FIELDS) next[key] = values[key];
      saveToStorage("keywords", scope, next);
      setFilters(next);
    },
    [scope],
  );

  const clear = useCallback(() => {
    clearStorage("keywords", scope);
    setFilters({ ...EMPTY_DOMAIN_FILTERS });
  }, [scope]);

  return { filters, save, clear };
}

export function useDomainPageFilterPreferences(scope: string) {
  const [filters, setFilters] = useState<PagesFilterValues>(() =>
    loadPageFilters(scope),
  );

  useEffect(() => {
    setFilters(loadPageFilters(scope));
  }, [scope]);

  const save = useCallback(
    (values: PagesFilterValues) => {
      const next = emptyPageFilters();
      for (const key of PAGE_FILTER_FIELDS) next[key] = values[key];
      saveToStorage("pages", scope, next);
      setFilters(next);
    },
    [scope],
  );

  const clear = useCallback(() => {
    clearStorage("pages", scope);
    setFilters(emptyPageFilters());
  }, [scope]);

  return { filters, save, clear };
}
