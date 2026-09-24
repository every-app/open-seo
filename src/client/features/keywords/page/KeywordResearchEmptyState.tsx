import { Link } from "@tanstack/react-router";
import { Clock, Globe, History, Search, X } from "lucide-react";
import { LOCATIONS } from "@/client/features/keywords/utils";
import type { KeywordResearchControllerState } from "./types";

import { Button } from "@/client/components/ui/button";
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
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 md:p-8 text-center space-y-4 mx-auto">
        <Globe className="size-10 mx-auto text-muted-foreground/70" />
        <div className="space-y-2">
          <p className="text-lg font-semibold text-foreground">
            Not enough keyword data for this query yet
          </p>
          <p className="text-sm text-muted-foreground">
            We could not find keyword opportunities for
            <span className="font-medium text-foreground">
              {` "${lastSearchKeyword}" `}
            </span>
            in
            <span className="font-medium text-foreground">
              {` ${LOCATIONS[lastSearchLocationCode] || "this location"}`}
            </span>
            .
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
        <section className="rounded-2xl border border-border bg-card p-5 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <History className="size-4 text-muted-foreground/70" />
              <span className="text-sm text-muted-foreground">
                {history.length} recent search
                {history.length !== 1 ? "es" : ""}
              </span>
            </div>
          </div>
          <div className="grid gap-2">
            {history.map((item) => (
              <div
                key={item.timestamp}
                className="group flex items-center gap-2 rounded-lg border border-border bg-card p-2"
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
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-1 py-1 text-left transition-colors hover:bg-muted"
                >
                  <Clock className="size-4 shrink-0 text-muted-foreground/70" />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {item.keyword}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {item.locationName}
                    </p>
                  </div>
                </Link>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-muted-foreground/70">
                    {new Date(item.timestamp).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    className="h-7 px-2.5 opacity-0 group-hover:opacity-100 p-1"
                    onClick={() => removeHistoryItem(item.timestamp)}
                  >
                    <X className="size-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-border bg-card/70 p-6 text-center text-muted-foreground/70 space-y-3">
          <Search className="size-10 mx-auto opacity-40" />
          <p className="text-lg font-medium text-foreground">
            Enter a keyword to get started
          </p>
          <p className="text-sm max-w-md mx-auto">
            Search for any keyword to see volume, difficulty, CPC, and related
            keyword ideas.
          </p>
        </section>
      )}
    </div>
  );
}
