import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { QueryKey } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import type { SearchTab } from "./types";
import {
  KEYWORD_RESEARCH_STALE_TIME_MS,
  buildKeywordResearchQueryKey,
  buildKeywordResearchRequest,
  keywordResearchQueryFn,
} from "@/client/features/keywords/hooks/useKeywordResearchData";
import { getLanguageCode } from "@/client/features/keywords/locations";
import { getBacklinksOverview } from "@/serverFunctions/backlinks";
import { getDomainOverview } from "@/serverFunctions/domain";
export type { SearchTab } from "./types";

type Props = {
  activeTabId: string | null;
  projectId: string;
  tabs: SearchTab[];
  onSelect: (tab: SearchTab) => void;
  onClose: (tabId: string) => void;
  onViewed: (tabId: string, when?: number) => void;
};

type SearchTabQueryConfig = {
  queryKey: QueryKey;
  queryFn: () => Promise<unknown>;
  staleTime?: number;
  gcTime?: number;
};

export function SearchTabStrip({
  activeTabId,
  projectId,
  tabs,
  onSelect,
  onClose,
  onViewed,
}: Props) {
  if (tabs.length === 0) return null;

  return (
    <div className="rounded-xl border border-base-300 bg-base-100 p-1">
      <div
        role="tablist"
        className="flex min-w-0 items-stretch gap-1 overflow-x-auto"
      >
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              data-search-tab-id={tab.id}
              className={`group flex shrink-0 items-stretch overflow-hidden rounded-md text-sm transition ${
                active
                  ? "bg-base-300 text-base-content shadow-sm"
                  : "text-base-content/80 hover:bg-base-200"
              }`}
            >
              <button
                type="button"
                role="tab"
                data-search-tab-id={tab.id}
                aria-selected={active}
                className="flex min-w-0 items-center gap-1.5 px-2.5 py-1.5 text-left"
                onClick={() => onSelect(tab)}
              >
                <SearchTabStatus
                  tab={tab}
                  projectId={projectId}
                  active={active}
                  onViewed={onViewed}
                />
                <span
                  className="max-w-[10rem] truncate font-medium"
                  title={tab.label}
                >
                  {tab.label}
                </span>
              </button>
              <button
                type="button"
                data-search-tab-id={tab.id}
                className="flex items-center px-1.5 text-base-content/50 opacity-60 transition hover:bg-base-content/10 hover:text-base-content hover:opacity-100 group-hover:opacity-100"
                onClick={() => onClose(tab.id)}
                aria-label={`Close ${tab.label} tab`}
              >
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SearchTabStatus({
  tab,
  projectId,
  active,
  onViewed,
}: {
  tab: SearchTab;
  projectId: string;
  active: boolean;
  onViewed: (tabId: string, when?: number) => void;
}) {
  const config = getSearchTabQueryConfig(projectId, tab);
  const query = useQuery({
    queryKey: config.queryKey,
    queryFn: config.queryFn,
    enabled: false,
    select: () => null,
    notifyOnChangeProps: ["dataUpdatedAt", "fetchStatus", "status"],
    staleTime: config.staleTime,
    gcTime: config.gcTime,
  });

  const isLoading = query.fetchStatus === "fetching";
  const hasResult = query.dataUpdatedAt > 0;
  const hasError = query.status === "error";
  const unviewed =
    !active &&
    hasResult &&
    (tab.viewedAt === null || tab.viewedAt < query.dataUpdatedAt);

  useEffect(() => {
    if (!active) return;
    if (!hasResult) return;
    if (tab.viewedAt !== null && tab.viewedAt >= query.dataUpdatedAt) return;
    onViewed(tab.id, query.dataUpdatedAt);
  }, [active, hasResult, onViewed, query.dataUpdatedAt, tab.id, tab.viewedAt]);

  const status = isLoading
    ? "loading"
    : hasError
      ? "error"
      : unviewed
        ? "unviewed"
        : "idle";

  return <SearchTabStatusIndicator status={status} />;
}

function SearchTabStatusIndicator({
  status,
}: {
  status: "idle" | "loading" | "unviewed" | "error";
}) {
  return (
    <span
      className="flex w-3.5 shrink-0 items-center justify-center"
      aria-hidden
    >
      {status === "loading" ? (
        <Loader2 className="size-3 animate-spin text-base-content/50" />
      ) : status === "error" ? (
        <span className="size-2 rounded-full bg-error" />
      ) : status === "unviewed" ? (
        <span className="size-2 rounded-full bg-primary" />
      ) : null}
    </span>
  );
}

function getSearchTabQueryConfig(
  projectId: string,
  tab: SearchTab,
): SearchTabQueryConfig {
  if (tab.input.type === "backlinks") {
    const input = tab.input;
    return {
      queryKey: ["backlinksOverview", projectId, input.scope, input.target],
      queryFn: () =>
        getBacklinksOverview({
          data: {
            projectId,
            target: input.target,
            scope: input.scope,
          },
        }),
    };
  }

  if (tab.input.type === "domain") {
    const input = tab.input;
    const trimmedDomain = input.domain.trim();
    const languageCode = getLanguageCode(input.locationCode);

    return {
      queryKey: [
        "domain-overview",
        projectId,
        trimmedDomain,
        input.subdomains,
        input.locationCode,
        languageCode,
      ],
      queryFn: () =>
        getDomainOverview({
          data: {
            projectId,
            domain: trimmedDomain,
            includeSubdomains: input.subdomains,
            locationCode: input.locationCode,
            languageCode,
          },
        }),
      staleTime: 5 * 60_000,
    };
  }

  const input = tab.input;
  const request = buildKeywordResearchRequest({
    projectId,
    keywordInput: input.keyword,
    locationCode: input.locationCode,
    resultLimit: input.resultLimit,
    mode: input.mode,
    clickstream: input.clickstream,
  });

  return {
    queryKey: buildKeywordResearchQueryKey(request),
    queryFn: () => {
      if (!request) throw new Error("Tab is missing a research request");
      return keywordResearchQueryFn(request);
    },
    staleTime: KEYWORD_RESEARCH_STALE_TIME_MS,
    gcTime: KEYWORD_RESEARCH_STALE_TIME_MS,
  };
}
