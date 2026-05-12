import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { memo } from "react";
import {
  KEYWORD_RESEARCH_STALE_TIME_MS,
  buildKeywordResearchQueryKey,
  buildKeywordResearchRequest,
  keywordResearchQueryFn,
} from "@/client/features/keywords/hooks/useKeywordResearchData";
import type {
  KeywordTab,
  UseKeywordTabsReturn,
} from "@/client/features/keywords/state/useKeywordTabs";

type Props = {
  projectId: string;
  tabs: UseKeywordTabsReturn;
  closeTab: (tabId: string) => void;
};

export function KeywordResearchTabStrip({ projectId, tabs, closeTab }: Props) {
  if (tabs.tabs.length === 0) return null;

  return (
    <div className="rounded-xl border border-base-300 bg-base-100 p-1">
      <div
        role="tablist"
        className="flex min-w-0 items-stretch gap-1 overflow-x-auto"
      >
        {tabs.tabs.map((tab) => (
          <TabPill
            key={tab.id}
            tab={tab}
            projectId={projectId}
            active={tab.id === tabs.activeTabId}
            setActiveTab={tabs.setActiveTab}
            closeTab={closeTab}
          />
        ))}
      </div>
    </div>
  );
}

const TabPill = memo(function TabPill({
  tab,
  projectId,
  active,
  setActiveTab,
  closeTab,
}: {
  tab: KeywordTab;
  projectId: string;
  active: boolean;
  setActiveTab: (tabId: string | null) => void;
  closeTab: (tabId: string) => void;
}) {
  const request = buildKeywordResearchRequest({
    projectId,
    keywordInput: tab.keyword,
    locationCode: tab.locationCode,
    resultLimit: tab.resultLimit,
    mode: tab.mode,
  });
  const queryKey = buildKeywordResearchQueryKey(request);

  // enabled: false — observer only. The active tab's controller owns fetching.
  const query = useQuery({
    queryKey,
    queryFn: () => {
      if (!request) throw new Error("Tab is missing a research request");
      return keywordResearchQueryFn(request);
    },
    enabled: false,
    select: () => null,
    notifyOnChangeProps: ["dataUpdatedAt", "errorUpdatedAt"],
    staleTime: KEYWORD_RESEARCH_STALE_TIME_MS,
    gcTime: KEYWORD_RESEARCH_STALE_TIME_MS,
  });

  const hasResult = query.dataUpdatedAt > 0;
  const unviewed =
    !active &&
    hasResult &&
    (tab.viewedAt === null || tab.viewedAt < query.dataUpdatedAt);
  const isError = query.isError;

  return (
    <div
      role="tab"
      aria-selected={active}
      tabIndex={0}
      onClick={() => setActiveTab(tab.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setActiveTab(tab.id);
        }
      }}
      className={`group flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition ${
        active
          ? "bg-base-300 text-base-content shadow-sm"
          : "text-base-content/80 hover:bg-base-200"
      }`}
    >
      <span
        className="flex w-3.5 shrink-0 items-center justify-center"
        aria-hidden
      >
        {isError ? (
          <span className="size-2 rounded-full bg-error" />
        ) : unviewed ? (
          <span className="size-2 rounded-full bg-primary" />
        ) : null}
      </span>
      <span className="max-w-[10rem] truncate font-medium" title={tab.keyword}>
        {tab.keyword}
      </span>
      <button
        type="button"
        className="rounded p-0.5 text-base-content/50 opacity-60 transition hover:bg-base-content/10 hover:text-base-content hover:opacity-100 group-hover:opacity-100"
        onClick={(event) => {
          event.stopPropagation();
          closeTab(tab.id);
        }}
        aria-label={`Close ${tab.keyword} tab`}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
});
