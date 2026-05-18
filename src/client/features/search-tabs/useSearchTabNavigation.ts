import { useCallback, useEffect } from "react";
import type { SearchTab, SearchTabInput } from "./types";
import { useSearchTabs } from "./useSearchTabs";

type UseSearchTabNavigationArgs = {
  storageKey: string;
  urlInput: SearchTabInput | null;
  getLabel: (input: SearchTabInput) => string;
  navigateToInput: (input: SearchTabInput | null) => void;
};

export function useSearchTabNavigation({
  storageKey,
  urlInput,
  getLabel,
  navigateToInput,
}: UseSearchTabNavigationArgs) {
  const tabs = useSearchTabs(storageKey);
  const { activeTabId, closeTab, findMatchingTab, openTab, setActiveTab } =
    tabs;

  useEffect(() => {
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
      setActiveTab(tab.id);
      navigateToInput(tab.input);
    },
    [navigateToInput, setActiveTab],
  );

  const closeSearchTab = useCallback(
    (tabId: string) => {
      const result = closeTab(tabId);
      if (result.closedActive) {
        navigateToInput(result.nextActiveTab?.input ?? null);
      }
    },
    [closeTab, navigateToInput],
  );

  const openSearchTab = useCallback(
    (input: SearchTabInput) =>
      openTab({
        label: getLabel(input),
        input,
      }),
    [getLabel, openTab],
  );

  return {
    activeTabId: tabs.activeTabId,
    tabs: tabs.tabs,
    canOpenTab: tabs.canOpenTab,
    closeTab: closeSearchTab,
    limit: tabs.limit,
    openTab: openSearchTab,
    selectTab,
    setActiveTab,
  };
}
