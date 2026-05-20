import { useQuery } from "@tanstack/react-query";
import { memo } from "react";
import { SearchTabStrip } from "@/client/features/search-tabs/SearchTabStrip";
import type { SearchTab } from "@/client/features/search-tabs/types";
import {
  KEYWORD_RESEARCH_STALE_TIME_MS,
  buildKeywordResearchQueryKey,
  buildKeywordResearchRequest,
  keywordResearchQueryFn,
} from "@/client/features/keywords/hooks/useKeywordResearchData";

type Props = {
  projectId: string;
  tabs: SearchTab[];
  activeTabId: string | null;
  onSelect: (tab: SearchTab) => void;
  onClose: (tabId: string) => void;
};

export function KeywordResearchTabStrip({
  projectId,
  tabs,
  activeTabId,
  onSelect,
  onClose,
}: Props) {
  if (tabs.length === 0) return null;

  return (
    <SearchTabStrip
      activeTabId={activeTabId}
      tabs={tabs}
      onSelect={onSelect}
      onClose={onClose}
      renderLeading={(tab, active) => (
        <KeywordTabStatus tab={tab} projectId={projectId} active={active} />
      )}
    />
  );
}

const KeywordTabStatus = memo(function KeywordTabStatus({
  tab,
  projectId,
  active,
}: {
  tab: SearchTab;
  projectId: string;
  active: boolean;
}) {
  if (tab.input.type !== "keyword") return null;

  const request = buildKeywordResearchRequest({
    projectId,
    keywordInput: tab.input.keyword,
    locationCode: tab.input.locationCode,
    resultLimit: tab.input.resultLimit,
    mode: tab.input.mode,
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
  );
});
