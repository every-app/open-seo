import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  EMPTY_TABS_STATE,
  KEYWORD_TABS_LIMIT,
  closeTab as closeTabAction,
  findMatchingTab,
  getKeywordTabsSnapshot,
  markTabViewed as markTabViewedAction,
  openTabs as openTabsAction,
  setActiveTab as setActiveTabAction,
  subscribeKeywordTabsStore,
  type KeywordTab,
  type OpenTabInput,
  type ProjectTabsState,
} from "./keywordTabsStore";

function useKeywordTabsSnapshot(projectId: string): ProjectTabsState {
  const getSnapshot = useCallback(
    () => getKeywordTabsSnapshot(projectId),
    [projectId],
  );
  return useSyncExternalStore(
    subscribeKeywordTabsStore,
    getSnapshot,
    () => EMPTY_TABS_STATE,
  );
}

export function useKeywordTabs(projectId: string) {
  const state = useKeywordTabsSnapshot(projectId);

  const openTabs = useCallback(
    (inputs: OpenTabInput[]) => openTabsAction(projectId, inputs),
    [projectId],
  );

  const closeTab = useCallback(
    (tabId: string) => closeTabAction(projectId, tabId),
    [projectId],
  );

  const setActiveTab = useCallback(
    (tabId: string | null) => setActiveTabAction(projectId, tabId),
    [projectId],
  );

  const markTabViewed = useCallback(
    (tabId: string, when?: number) =>
      markTabViewedAction(projectId, tabId, when),
    [projectId],
  );

  // Reads the latest module snapshot directly so this callback is safe to use
  // in effect dependency arrays — its reference is stable across renders.
  const findMatching = useCallback(
    (input: OpenTabInput) =>
      findMatchingTab(getKeywordTabsSnapshot(projectId), input),
    [projectId],
  );

  const activeTab = useMemo(
    () => state.tabs.find((tab) => tab.id === state.activeTabId) ?? null,
    [state],
  );

  return {
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    activeTab,
    isAtCap: state.tabs.length >= KEYWORD_TABS_LIMIT,
    limit: KEYWORD_TABS_LIMIT,
    openTabs,
    closeTab,
    setActiveTab,
    markTabViewed,
    findMatchingTab: findMatching,
  };
}

export type UseKeywordTabsReturn = ReturnType<typeof useKeywordTabs>;
export type { KeywordTab };
