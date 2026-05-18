import { useCallback, useMemo } from "react";
import type {
  KeywordSearchTabInput,
  SearchTab,
} from "@/client/features/search-tabs/types";
import {
  getSearchTabsSnapshot,
  useSearchTabs,
} from "@/client/features/search-tabs/useSearchTabs";

export type OpenTabInput = Omit<KeywordSearchTabInput, "type">;

type KeywordTab = SearchTab & {
  input: KeywordSearchTabInput;
  keyword: string;
  locationCode: KeywordSearchTabInput["locationCode"];
  resultLimit: KeywordSearchTabInput["resultLimit"];
  mode: KeywordSearchTabInput["mode"];
};

type ProjectTabsState = {
  tabs: KeywordTab[];
  activeTabId: string | null;
};

type OpenTabsResult = {
  opened: KeywordTab[];
  focused: KeywordTab[];
  activeTab: KeywordTab | null;
  dropped: OpenTabInput[];
};

const KEYWORD_TABS_KEY_PREFIX = "keyword";

function keywordTabsKey(projectId: string) {
  return `${KEYWORD_TABS_KEY_PREFIX}:${projectId}`;
}

function toSearchTabInput(input: OpenTabInput): KeywordSearchTabInput {
  return {
    type: "keyword",
    keyword: input.keyword,
    locationCode: input.locationCode,
    resultLimit: input.resultLimit,
    mode: input.mode,
  };
}

function toKeywordTab(tab: SearchTab): KeywordTab | null {
  if (tab.input.type !== "keyword") return null;
  return {
    ...tab,
    input: tab.input,
    keyword: tab.input.keyword,
    locationCode: tab.input.locationCode,
    resultLimit: tab.input.resultLimit,
    mode: tab.input.mode,
  };
}

function toKeywordTabs(tabs: readonly SearchTab[]): KeywordTab[] {
  return tabs.flatMap((tab) => {
    const keywordTab = toKeywordTab(tab);
    return keywordTab ? [keywordTab] : [];
  });
}

export function getKeywordTabsSnapshot(projectId: string): ProjectTabsState {
  const snapshot = getSearchTabsSnapshot(keywordTabsKey(projectId));
  return {
    tabs: toKeywordTabs(snapshot.tabs),
    activeTabId: snapshot.activeTabId,
  };
}

export function useKeywordTabs(projectId: string) {
  const tabs = useSearchTabs(keywordTabsKey(projectId));
  const keywordTabs = useMemo(() => toKeywordTabs(tabs.tabs), [tabs.tabs]);
  const activeTab = useMemo(
    () => keywordTabs.find((tab) => tab.id === tabs.activeTabId) ?? null,
    [keywordTabs, tabs.activeTabId],
  );

  const openTabs = useCallback(
    (inputs: OpenTabInput[]): OpenTabsResult => {
      const opened: KeywordTab[] = [];
      const focused: KeywordTab[] = [];
      const dropped: OpenTabInput[] = [];
      let resultActiveTab: KeywordTab | null = null;
      let simulatedTabs = keywordTabs;

      for (const input of inputs) {
        const result = tabs.openTab({
          label: input.keyword,
          input: toSearchTabInput(input),
        });

        if (result.dropped) {
          dropped.push(input);
          continue;
        }

        if (!result.tab) continue;
        const keywordTab = toKeywordTab(result.tab);
        if (!keywordTab) continue;
        resultActiveTab = keywordTab;

        const wasAlreadyOpen = simulatedTabs.some(
          (tab) => tab.id === keywordTab.id,
        );
        if (wasAlreadyOpen) focused.push(keywordTab);
        else {
          opened.push(keywordTab);
          simulatedTabs = [...simulatedTabs, keywordTab];
        }
      }

      return { opened, focused, activeTab: resultActiveTab, dropped };
    },
    [keywordTabs, tabs],
  );

  const findMatchingTab = useCallback(
    (input: OpenTabInput) => {
      const match = tabs.findMatchingTab(toSearchTabInput(input));
      return match ? toKeywordTab(match) : null;
    },
    [tabs],
  );

  const closeTab = useCallback(
    (tabId: string) => {
      const result = tabs.closeTab(tabId);
      return {
        closedActive: result.closedActive,
        nextActiveTab: result.nextActiveTab
          ? toKeywordTab(result.nextActiveTab)
          : null,
      };
    },
    [tabs],
  );

  return {
    tabs: keywordTabs,
    activeTabId: tabs.activeTabId,
    activeTab,
    isAtCap: keywordTabs.length >= tabs.limit,
    limit: tabs.limit,
    openTabs,
    closeTab,
    setActiveTab: tabs.setActiveTab,
    markTabViewed: tabs.markTabViewed,
    findMatchingTab,
  };
}

export type UseKeywordTabsReturn = ReturnType<typeof useKeywordTabs>;
