import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Globe, Search, Tag } from "lucide-react";
import { CountryFlag } from "@/client/components/CountryFlag";
import { EmptyState } from "@/client/components/EmptyState";
import { RecentSearches } from "@/client/components/RecentSearches";
import { LOCATIONS } from "@/client/features/keywords/utils";
import type { KeywordResearchControllerState } from "./types";
import {
  KeywordSuggestions,
  keywordSuggestionsQueryOptions,
} from "./KeywordSuggestions";

type Props = {
  controller: KeywordResearchControllerState;
  projectId: string;
};

export function KeywordResearchNoResults({
  controller,
}: Pick<Props, "controller">) {
  const { lastSearchKeyword, lastSearchLocationCode } = controller;

  return (
    <div className="mx-auto w-full max-w-2xl pt-1">
      <EmptyState
        variant="card"
        icon={Globe}
        title="Not enough keyword data for this query yet"
        description={
          <>
            We could not find keyword opportunities for
            <span className="font-medium text-foreground">
              {` "${lastSearchKeyword}" `}
            </span>
            in
            <span className="font-medium text-foreground">
              {` ${LOCATIONS[lastSearchLocationCode] || "this location"}`}
            </span>
            .
          </>
        }
      />
    </div>
  );
}

/**
 * What the search card shows before a search: past searches and suggested
 * ones. With neither, a first prompt.
 */
export function KeywordSearchHistory({ controller, projectId }: Props) {
  const suggestionsQuery = useQuery(keywordSuggestionsQueryOptions(projectId));
  const searched = new Set(
    controller.history.map((item) => item.keyword.trim().toLowerCase()),
  );
  const suggestions = (suggestionsQuery.data?.suggestions ?? []).filter(
    (suggestion) => !searched.has(suggestion.keyword),
  );
  const hasHistory = controller.history.length > 0;
  const showSuggestions =
    suggestionsQuery.isError ||
    suggestions.length > 0 ||
    Boolean(suggestionsQuery.data?.canGenerate);
  // Until suggestions load, a first visit can't tell which prompt to show.
  const showRecentSearches =
    hasHistory || (suggestionsQuery.isSuccess && !showSuggestions);

  return (
    <>
      {showRecentSearches ? (
        <RecentSearchList controller={controller} projectId={projectId} />
      ) : null}
      {showSuggestions ? (
        <KeywordSuggestions
          projectId={projectId}
          query={suggestionsQuery}
          suggestions={suggestions}
          groupKeywords={controller.preferredGroupKeywords}
          afterRecentSearches={hasHistory}
        />
      ) : null}
    </>
  );
}

function RecentSearchList({ controller, projectId }: Props) {
  return (
    <RecentSearches
      embedded
      items={controller.history}
      loaded={controller.historyLoaded}
      onRemove={controller.removeHistoryItem}
      emptyIcon={Search}
      emptyIllustration={<KeywordRowsIllustration />}
      emptyTitle="Enter a keyword to get started"
      emptyDescription="Search for any keyword to see volume, difficulty, CPC, and related keyword ideas."
      getTitle={(item) => item.keyword}
      getSubtitle={(item) => (
        <span className="inline-flex items-center gap-1.5">
          <CountryFlag locationCode={item.locationCode} />
          {item.locationName}
        </span>
      )}
      renderLink={(item, props) => (
        <Link
          from="/p/$projectId/keywords"
          to="/p/$projectId/keywords"
          params={{ projectId }}
          search={{
            q: item.keyword,
            loc: item.locationCode,
            locName: item.localLocationName,
            grp: controller.preferredGroupKeywords ? true : undefined,
          }}
          replace
          {...props}
        />
      )}
    />
  );
}

const ILLUSTRATION_ROWS = ["w-24", "w-32", "w-20", "w-28"];

/** A keyword results list fading out, standing in for the results to come. */
function KeywordRowsIllustration() {
  return (
    <div
      aria-hidden
      className="flex w-64 flex-col gap-2 py-4 mask-y-from-70% mask-y-to-100%"
    >
      {ILLUSTRATION_ROWS.map((width) => (
        <div
          key={width}
          className="flex items-center gap-2 rounded-lg bg-foreground/5 px-3 py-3"
        >
          <Tag className="size-3.5 text-muted-foreground/50" />
          <div className={`h-1.5 rounded-full bg-foreground/10 ${width}`} />
          <div className="ml-auto h-1.5 w-5 rounded-full bg-foreground/10" />
          <div className="h-1.5 w-8 rounded-full bg-foreground/10" />
        </div>
      ))}
    </div>
  );
}
