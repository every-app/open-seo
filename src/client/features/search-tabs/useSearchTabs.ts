import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  researchScopeSchema,
  type ResearchScope,
} from "@/shared/researchScope";
import type { SearchTab, SearchTabInput } from "./types";

type TabsState = {
  tabs: SearchTab[];
  activeTabId: string | null;
};

type OpenTabInput = {
  label: string;
  input: SearchTabInput;
};

const EMPTY_STATE: TabsState = {
  tabs: [],
  activeTabId: null,
};

const CHANGE_EVENT = "search-tabs-change";
const stateCache = new Map<string, TabsState>();
const SEARCH_TABS_LIMIT = 20;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toResearchScope(value: unknown): ResearchScope | null {
  const parsed = researchScopeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseTabInput(value: unknown): SearchTabInput | null {
  if (!isRecord(value)) return null;
  if (value.type === "backlinks") {
    if (typeof value.target !== "string" || value.target === "") return null;
    // Legacy backlinks tabs stored "page"; "domain" survives as a valid scope.
    const scope =
      value.scope === "page" ? "exact_url" : toResearchScope(value.scope);
    if (!scope) return null;
    return {
      type: "backlinks",
      target: value.target,
      scope,
    };
  }

  if (value.type === "domain") {
    if (typeof value.domain !== "string" || value.domain === "") return null;
    // locationCode is optional in DomainSearchTabInput: tabs opened at the
    // default location persist no loc param, so accept a missing key.
    if (
      value.locationCode !== undefined &&
      typeof value.locationCode !== "number"
    ) {
      return null;
    }
    // Legacy tabs stored an "include subdomains" boolean instead of a scope.
    const scope =
      toResearchScope(value.scope) ??
      (typeof value.subdomains === "boolean"
        ? value.subdomains
          ? "subdomains"
          : "domain"
        : null);
    if (!scope) return null;
    return {
      type: "domain",
      domain: value.domain,
      scope,
      locationCode:
        typeof value.locationCode === "number" ? value.locationCode : undefined,
    };
  }

  if (value.type === "keyword") {
    if (typeof value.keyword !== "string" || value.keyword === "") return null;
    // locationCode is optional in KeywordSearchTabInput: tabs opened at the
    // default location persist no loc param, so accept a missing key.
    if (
      value.locationCode !== undefined &&
      typeof value.locationCode !== "number"
    ) {
      return null;
    }
    if (
      value.resultLimit !== 150 &&
      value.resultLimit !== 300 &&
      value.resultLimit !== 500
    ) {
      return null;
    }
    if (
      value.mode !== "auto" &&
      value.mode !== "related" &&
      value.mode !== "suggestions" &&
      value.mode !== "ideas"
    ) {
      return null;
    }
    return {
      type: "keyword",
      keyword: value.keyword,
      locationCode:
        typeof value.locationCode === "number" ? value.locationCode : undefined,
      resultLimit: value.resultLimit,
      mode: value.mode,
      // Tabs persisted before the clickstream toggle existed default to off.
      clickstream: value.clickstream === true,
    };
  }

  return null;
}

function storageKey(key: string) {
  return `search-tabs:${key}`;
}

function tabInputKey(value: unknown): string {
  return JSON.stringify(value);
}

// Exported for unit tests.
export function parseStoredState(value: unknown): TabsState {
  if (!isRecord(value)) return EMPTY_STATE;
  if (!Array.isArray(value.tabs)) return EMPTY_STATE;
  const tabs = value.tabs
    .flatMap((tab): SearchTab[] => {
      if (!isRecord(tab)) return [];
      if (typeof tab.id !== "string" || tab.id === "") return [];
      if (typeof tab.label !== "string" || tab.label === "") return [];
      if (typeof tab.createdAt !== "number") return [];
      const input = parseTabInput(tab.input);
      if (!input) return [];
      return [
        {
          id: tab.id,
          label: tab.label,
          input,
          createdAt: tab.createdAt,
          viewedAt:
            tab.viewedAt === null
              ? null
              : typeof tab.viewedAt === "number"
                ? tab.viewedAt
                : null,
        },
      ];
    })
    // Keep the newest tabs when over the limit, matching openTab's eviction.
    .slice(-SEARCH_TABS_LIMIT);
  const activeTabId =
    typeof value.activeTabId === "string" &&
    tabs.some((tab) => tab.id === value.activeTabId)
      ? value.activeTabId
      : null;
  return { tabs, activeTabId };
}

function loadState(key: string): TabsState {
  if (typeof window === "undefined") return EMPTY_STATE;
  try {
    const raw = window.sessionStorage.getItem(storageKey(key));
    if (!raw) return EMPTY_STATE;
    return parseStoredState(JSON.parse(raw));
  } catch {
    return EMPTY_STATE;
  }
}

function getSearchTabsSnapshot(key: string): TabsState {
  let state = stateCache.get(key);
  if (!state) {
    state = loadState(key);
    stateCache.set(key, state);
  }
  return state;
}

function persist(key: string, state: TabsState) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey(key), JSON.stringify(state));
  } catch {
    // In-memory tabs still work if sessionStorage is unavailable.
  }
}

function notify() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function update(key: string, updater: (current: TabsState) => TabsState) {
  const current = getSearchTabsSnapshot(key);
  const next = updater(current);
  if (next === current) return;
  stateCache.set(key, next);
  persist(key, next);
  notify();
}

function subscribe(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

// At capacity, evict the oldest tabs instead of refusing the new one.
// Exported for unit tests.
export function appendTabWithEviction(
  tabs: SearchTab[],
  next: SearchTab,
): SearchTab[] {
  const kept = tabs.slice(Math.max(0, tabs.length - SEARCH_TABS_LIMIT + 1));
  return [...kept, next];
}

function generateTabId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useSearchTabs(key: string) {
  const state = useSyncExternalStore(
    subscribe,
    () => getSearchTabsSnapshot(key),
    () => EMPTY_STATE,
  );

  const openTab = useCallback(
    ({ label, input }: OpenTabInput) => {
      update(key, (current) => {
        const inputKey = tabInputKey(input);
        const existing = current.tabs.find(
          (tab) => tabInputKey(tab.input) === inputKey,
        );
        if (existing) {
          return { ...current, activeTabId: existing.id };
        }
        const next: SearchTab = {
          id: generateTabId(),
          label,
          input,
          createdAt: Date.now(),
          viewedAt: null,
        };
        return {
          tabs: appendTabWithEviction(current.tabs, next),
          activeTabId: next.id,
        };
      });
    },
    [key],
  );

  const setActiveTab = useCallback(
    (tabId: string | null) => {
      update(key, (current) => {
        if (current.activeTabId === tabId) return current;
        if (tabId !== null && !current.tabs.some((tab) => tab.id === tabId)) {
          return current;
        }
        return { ...current, activeTabId: tabId };
      });
    },
    [key],
  );

  const closeTab = useCallback(
    (
      tabId: string,
    ): {
      closedActive: boolean;
      nextActiveTab: SearchTab | null;
    } => {
      let nextActiveTab: SearchTab | null = null;
      let closedActive = false;
      update(key, (current) => {
        const index = current.tabs.findIndex((tab) => tab.id === tabId);
        if (index === -1) return current;
        const tabs = current.tabs.filter((tab) => tab.id !== tabId);
        let activeTabId = current.activeTabId;
        if (current.activeTabId === tabId) {
          closedActive = true;
          // Post-removal array: tabs[index] is the tab that slid into the
          // closed tab's slot (its right-hand neighbor). Select it first —
          // browser-tab convention and the documented e2e contract — and fall
          // back to the left neighbor only when the last tab was closed.
          const neighbor = tabs[index] ?? tabs[index - 1] ?? null;
          activeTabId = neighbor?.id ?? null;
          nextActiveTab = neighbor;
        }
        return { tabs, activeTabId };
      });
      return { closedActive, nextActiveTab };
    },
    [key],
  );

  const markTabViewed = useCallback(
    (tabId: string, when = Date.now()) => {
      update(key, (current) => {
        let changed = false;
        const tabs = current.tabs.map((tab) => {
          if (tab.id !== tabId) return tab;
          if (tab.viewedAt !== null && tab.viewedAt >= when) return tab;
          changed = true;
          return { ...tab, viewedAt: when };
        });
        if (!changed) return current;
        return { ...current, tabs };
      });
    },
    [key],
  );

  const findMatchingTab = useCallback(
    (input: SearchTabInput) => {
      const inputKey = tabInputKey(input);
      return (
        state.tabs.find((tab) => tabInputKey(tab.input) === inputKey) ?? null
      );
    },
    [state.tabs],
  );

  const activeTab = useMemo(
    () => state.tabs.find((tab) => tab.id === state.activeTabId) ?? null,
    [state.activeTabId, state.tabs],
  );

  return {
    activeTab,
    activeTabId: state.activeTabId,
    tabs: state.tabs,
    closeTab,
    findMatchingTab,
    markTabViewed,
    openTab,
    setActiveTab,
  };
}
