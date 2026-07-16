import { useCallback, useEffect, useMemo, useRef } from "react";
import type { SearchTab, SearchTabInput } from "./types";
import { useSearchTabs } from "./useSearchTabs";

type UseSearchTabNavigationArgs = {
  storageKey: string;
  urlInput: SearchTabInput | null;
  getLabel: (input: SearchTabInput) => string;
  navigateToInput: (input: SearchTabInput | null) => void;
};

export function tabInputKey(input: SearchTabInput | null) {
  return input ? JSON.stringify(input) : "";
}

export function useSearchTabNavigation({
  storageKey,
  urlInput,
  getLabel,
  navigateToInput,
}: UseSearchTabNavigationArgs) {
  const closedInputKeysRef = useRef<Set<string>>(new Set());
  const tabs = useSearchTabs(storageKey);
  const {
    activeTabId,
    closeTab,
    findMatchingTab,
    markTabViewed,
    openTab,
    setActiveTab,
  } = tabs;

  useEffect(() => {
    const urlKey = tabInputKey(urlInput);
    if (closedInputKeysRef.current.has(urlKey)) {
      return;
    }
    closedInputKeysRef.current.clear();

    if (!urlInput) {
      setActiveTab(null);
      return;
    }

    const existing = findMatchingTab(urlInput);
    if (existing) {
      if (activeTabId !== existing.id) {
        setActiveTab(existing.id);
      }
      return;
    }

    const result = openTab({
      label: getLabel(urlInput),
      input: urlInput,
    });
    if (result.dropped) {
      setActiveTab(null);
    }
  }, [activeTabId, findMatchingTab, getLabel, openTab, setActiveTab, urlInput]);

  const selectTab = useCallback(
    (tab: SearchTab) => {
      closedInputKeysRef.current.delete(tabInputKey(tab.input));
      setActiveTab(tab.id);
      navigateToInput(tab.input);
    },
    [navigateToInput, setActiveTab],
  );

  const closeSearchTab = useCallback(
    (tabId: string) => {
      const closingTab = tabs.tabs.find((tab) => tab.id === tabId) ?? null;
      if (closingTab) {
        closedInputKeysRef.current.add(tabInputKey(closingTab.input));
      }
      const result = closeTab(tabId);
      if (result.closedActive) {
        navigateToInput(result.nextActiveTab?.input ?? null);
      }
    },
    [closeTab, navigateToInput, tabs.tabs],
  );

  const openSearchTab = useCallback(
    (input: SearchTabInput) => {
      closedInputKeysRef.current.delete(tabInputKey(input));
      return openTab({
        label: getLabel(input),
        input,
      });
    },
    [getLabel, openTab],
  );

  const visibleTabs = useMemo(
    () =>
      tabs.tabs.filter(
        (tab) => !closedInputKeysRef.current.has(tabInputKey(tab.input)),
      ),
    [tabs.tabs],
  );

  return {
    activeTabId: tabs.activeTabId,
    tabs: visibleTabs,
    canOpenTab: tabs.canOpenTab,
    closeTab: closeSearchTab,
    limit: tabs.limit,
    markTabViewed,
    openTab: openSearchTab,
    selectTab,
    setActiveTab,
  };
}
