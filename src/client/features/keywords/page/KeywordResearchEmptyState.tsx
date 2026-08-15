import { Link } from "@tanstack/react-router";
import { Clock, Globe, History, Search, X } from "lucide-react";
import { LOCATIONS } from "@/client/features/keywords/utils";
import type { KeywordResearchControllerState } from "./types";

type Props = {
  controller: KeywordResearchControllerState;
  projectId: string;
};

export function KeywordResearchEmptyState({ controller, projectId }: Props) {
  const { hasSearched, isLoading, lastSearchError } = controller;

  if (hasSearched && !isLoading && !lastSearchError) {
    return <NoResultsState controller={controller} />;
  }

  return <SearchHistoryState controller={controller} projectId={projectId} />;
}

function NoResultsState({
  controller,
}: {
  controller: KeywordResearchControllerState;
}) {
  const { lastSearchKeyword, lastSearchLocationCode } = controller;

  return (
    <div className="pt-1">
      <div className="w-full max-w-2xl rounded-2xl border border-base-300 bg-base-100 p-6 md:p-8 text-center space-y-4 mx-auto">
        <Globe className="size-10 mx-auto text-base-content/40" />
        <div className="space-y-2">
          <p className="text-lg font-semibold text-base-content">
            此查询暂时没有足够的关键词数据
          </p>
          <p className="text-sm text-base-content/70">
            未找到
            <span className="font-medium text-base-content">
              {`“${lastSearchKeyword}”`}
            </span>
            在
            <span className="font-medium text-base-content">
              {` ${LOCATIONS[lastSearchLocationCode] || "此地区"}`}
            </span>
            的关键词机会。
          </p>
        </div>
      </div>
    </div>
  );
}

function SearchHistoryState({
  controller,
  projectId,
}: {
  controller: KeywordResearchControllerState;
  projectId: string;
}) {
  const { history, historyLoaded, removeHistoryItem } = controller;

  if (!historyLoaded) {
    return null;
  }

  return (
    <div className="space-y-4 pt-1">
      {history.length > 0 ? (
        <section className="rounded-2xl border border-base-300 bg-base-100 p-5 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <History className="size-4 text-base-content/45" />
              <span className="text-sm text-base-content/60">
                {history.length} 条最近搜索
              </span>
            </div>
          </div>
          <div className="grid gap-2">
            {history.map((item) => (
              <div
                key={item.timestamp}
                className="group flex items-center gap-2 rounded-lg border border-base-300 bg-base-100 p-2"
              >
                <Link
                  from="/p/$projectId/keywords"
                  to="/p/$projectId/keywords"
                  params={{ projectId }}
                  search={{
                    q: item.keyword,
                    loc: item.locationCode,
                  }}
                  replace
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-1 py-1 text-left transition-colors hover:bg-base-200"
                >
                  <Clock className="size-4 shrink-0 text-base-content/40" />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-base-content">
                      {item.keyword}
                    </p>
                    <p className="truncate text-sm text-base-content/60">
                      {item.locationName}
                    </p>
                  </div>
                </Link>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-base-content/40">
                    {new Date(item.timestamp).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs opacity-0 group-hover:opacity-100 p-1"
                    onClick={() => removeHistoryItem(item.timestamp)}
                  >
                    <X className="size-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-base-300 bg-base-100/70 p-6 text-center text-base-content/50 space-y-3">
          <Search className="size-10 mx-auto opacity-40" />
          <p className="text-lg font-medium text-base-content/80">
            输入关键词开始研究
          </p>
          <p className="text-sm max-w-md mx-auto">
            搜索任意关键词，查看搜索量、难度、CPC 和相关关键词建议。
          </p>
        </section>
      )}
    </div>
  );
}
