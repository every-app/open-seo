import { Clock, Globe, History, Search, X } from "lucide-react";
import { reverse } from "remeda";
import { LOCATIONS } from "@/client/features/keywords/utils";
import type { KeywordResearchControllerState } from "./types";

type Props = {
  controller: KeywordResearchControllerState;
};

export function KeywordResearchEmptyState({ controller }: Props) {
  const { hasSearched, isLoading, lastSearchError } = controller;

  if (hasSearched && !isLoading && !lastSearchError) {
    return <NoResultsState controller={controller} />;
  }

  return <SearchHistoryState controller={controller} />;
}

function NoResultsState({ controller }: Props) {
  const {
    controlsForm,
    lastResultSource,
    lastSearchKeyword,
    lastSearchLocationCode,
    lastUsedFallback,
    onSearch,
  } = controller;

  return (
    <div className="flex-1 flex items-center justify-center px-4 md:px-6 py-6">
      <div className="w-full max-w-2xl rounded-2xl border border-base-300 bg-base-100 p-6 md:p-8 text-center space-y-4">
        <Globe className="size-10 mx-auto text-base-content/40" />
        <div className="space-y-2">
          <p className="text-lg font-semibold text-base-content">
            Not enough keyword data for this query yet
          </p>
          <p className="text-sm text-base-content/70">
            We could not find keyword opportunities for
            <span className="font-medium text-base-content">
              {` "${lastSearchKeyword}" `}
            </span>
            in
            <span className="font-medium text-base-content">
              {` ${LOCATIONS[lastSearchLocationCode] || "this location"}`}
            </span>
            .
          </p>
        </div>

        <div className="rounded-xl bg-base-200/70 px-4 py-3 text-left text-sm text-base-content/70 space-y-1">
          <p>
            Source checked:{" "}
            <span className="font-medium">{lastResultSource}</span>
            {lastUsedFallback ? (
              <span> (with fallback chain: related - suggestions - ideas)</span>
            ) : null}
          </p>
          <p>Try a broader phrase, swap word order, or change location.</p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            className="btn btn-sm btn-outline"
            onClick={() => {
              const words = lastSearchKeyword.split(/\s+/).filter(Boolean);
              const reversedKeyword = reverse(words).join(" ");
              if (!reversedKeyword || reversedKeyword === lastSearchKeyword) {
                return;
              }
              controlsForm.setFieldValue("keyword", reversedKeyword);
              onSearch({
                keyword: reversedKeyword,
                locationCode: lastSearchLocationCode,
              });
            }}
            disabled={lastSearchKeyword.trim().split(/\s+/).length < 2}
          >
            Try reversed phrase
          </button>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => {
              const firstWord = lastSearchKeyword
                .split(/\s+/)
                .filter(Boolean)[0];
              if (!firstWord) return;
              controlsForm.setFieldValue("keyword", firstWord);
              onSearch({
                keyword: firstWord,
                locationCode: lastSearchLocationCode,
              });
            }}
          >
            Try broader seed
          </button>
        </div>
      </div>
    </div>
  );
}

function SearchHistoryState({ controller }: Props) {
  const {
    clearHistory,
    controlsForm,
    history,
    historyLoaded,
    onSearch,
    removeHistoryItem,
  } = controller;

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-6">
      <div className="mx-auto w-full max-w-5xl space-y-6 pt-3 md:pt-5">
        {historyLoaded && history.length > 0 ? (
          <section className="rounded-2xl border border-base-300 bg-base-100 p-5 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <History className="size-4 text-base-content/45" />
                <span className="text-sm text-base-content/60">
                  {history.length} recent search
                  {history.length !== 1 ? "es" : ""}
                </span>
              </div>
              <button
                className="btn btn-ghost btn-xs text-error"
                onClick={clearHistory}
              >
                Clear all
              </button>
            </div>
            <div className="grid gap-2">
              {history.map((item) => (
                <div
                  key={item.timestamp}
                  className="flex items-center justify-between p-3 rounded-lg border border-base-300 bg-base-100 hover:bg-base-200 transition-colors text-left group cursor-pointer"
                  onClick={() => {
                    controlsForm.setFieldValue("keyword", item.keyword);
                    controlsForm.setFieldValue(
                      "locationCode",
                      item.locationCode,
                    );
                    onSearch({
                      keyword: item.keyword,
                      locationCode: item.locationCode,
                    });
                  }}
                >
                  <div className="flex items-center gap-3">
                    <Clock className="size-4 text-base-content/40" />
                    <div>
                      <p className="font-medium text-base-content">
                        {item.keyword}
                      </p>
                      <p className="text-sm text-base-content/60">
                        {item.locationName}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-base-content/40">
                      {new Date(item.timestamp).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <button
                      className="btn btn-ghost btn-xs opacity-0 group-hover:opacity-100 p-1"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeHistoryItem(item.timestamp);
                      }}
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
              Enter a keyword to get started
            </p>
            <p className="text-sm max-w-md mx-auto">
              Search for any keyword to see volume, difficulty, CPC, and related
              keyword ideas.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
