import { useCallback, useMemo } from "react";
import { ErrorState } from "@/client/components/ErrorState";
import { FormDialog } from "@/client/components/FormDialog";
import { BackButton, PageHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";
import { InsufficientCreditsError } from "@/client/features/billing/InsufficientCreditsError";
import { getErrorCode } from "@/client/lib/error-messages";
import { formatLocationLabel } from "@/shared/keyword-locations";
import { useKeywordResearchController } from "@/client/features/keywords/state/useKeywordResearchController";
import type {
  KeywordResearchControllerInput,
  KeywordSubmitValues,
} from "@/client/features/keywords/state/useKeywordResearchController";
import { parseKeywordInput } from "@/client/features/keywords/state/keywordControllerActions";
import {
  useKeywordSearchParams,
  useResolvedKeywordLocation,
} from "@/client/features/keywords/state/keywordControllerInternals";
import type {
  KeywordSearchTabInput,
  SearchTab,
} from "@/client/features/search-tabs/types";
import { SearchTabStrip } from "@/client/features/search-tabs/SearchTabStrip";
import {
  tabInputKey,
  useSearchTabNavigation,
} from "@/client/features/search-tabs/useSearchTabNavigation";
import { KeywordResearchEmptyState } from "./KeywordResearchEmptyState";
import { KeywordResearchLoadingState } from "./KeywordResearchLoadingState";
import { KeywordResearchResults } from "./KeywordResearchResults";
import { KeywordResearchSearchBar } from "./KeywordResearchSearchBar";
import type { KeywordResearchControllerState } from "./types";

type ControllerProps = Omit<KeywordResearchControllerInput, "onFormSubmit">;
type Props = Omit<
  ControllerProps,
  "locationCode" | "displayedLocationCode" | "setPreferredLocationCode"
> & { locationCode?: number };
type KeywordSearchTab = SearchTab & { input: KeywordSearchTabInput };

function isKeywordSearchTab(tab: SearchTab): tab is KeywordSearchTab {
  return tab.input.type === "keyword";
}

export function KeywordResearchPage(input: Props) {
  const setSearchParams = useKeywordSearchParams();
  const projectId = input.projectId;
  const { locationCode, displayedLocationCode, setPreferredLocationCode } =
    useResolvedKeywordLocation({
      projectId,
      locationCode: input.locationCode,
    });

  const navigateToKeywordInput = useCallback(
    (tabInput: KeywordSearchTabInput | null) => {
      if (!tabInput) {
        setSearchParams({
          q: undefined,
          loc: undefined,
          locName: undefined,
          kLimit: undefined,
          mode: undefined,
          cs: undefined,
          grp: undefined,
        });
        return;
      }

      setSearchParams({
        q: tabInput.keyword,
        loc: tabInput.locationCode,
        locName: tabInput.locationName,
        kLimit: tabInput.resultLimit === 150 ? undefined : tabInput.resultLimit,
        mode: tabInput.mode === "auto" ? undefined : tabInput.mode,
        cs: tabInput.clickstream ? true : undefined,
        grp: tabInput.groupKeywords ? true : undefined,
      });
    },
    [setSearchParams],
  );

  const urlInput = useMemo<KeywordSearchTabInput | null>(() => {
    const keywords = parseKeywordInput(input.keywordInput);
    const keyword = keywords[0];
    if (!keyword) return null;
    return {
      type: "keyword",
      keyword,
      locationCode,
      locationName: input.locationName,
      resultLimit: input.resultLimit,
      mode: input.keywordMode,
      clickstream: input.clickstream,
      groupKeywords: input.groupKeywords,
    };
  }, [
    input.clickstream,
    input.groupKeywords,
    input.keywordInput,
    input.keywordMode,
    input.locationName,
    locationCode,
    input.resultLimit,
  ]);
  const searchTabs = useSearchTabNavigation({
    storageKey: `keyword:${projectId}`,
    urlInput,
    getLabel: useCallback((tabInput) => {
      if (tabInput.type !== "keyword") return "";
      return tabInput.locationName
        ? `${tabInput.keyword} · ${formatLocationLabel(tabInput.locationName, 1)}`
        : tabInput.keyword;
    }, []),
    navigateToInput: useCallback(
      (tabInput) => {
        navigateToKeywordInput(tabInput?.type === "keyword" ? tabInput : null);
      },
      [navigateToKeywordInput],
    ),
  });

  const activeTab = useMemo<KeywordSearchTab | null>(() => {
    if (!urlInput) return null;
    const tab = searchTabs.tabs.find(
      (candidate) => candidate.id === searchTabs.activeTabId,
    );
    // activeTabId syncs in an effect, so it trails urlInput by a render; the
    // stale tab must not drive a paid query for a market the URL no longer names.
    return tab &&
      isKeywordSearchTab(tab) &&
      tabInputKey(tab.input) === tabInputKey(urlInput)
      ? tab
      : null;
  }, [searchTabs.activeTabId, searchTabs.tabs, urlInput]);

  const onFormSubmit = useCallback(
    (value: KeywordSubmitValues) => {
      const keywords = parseKeywordInput(value.keyword);
      if (keywords.length === 0) return;

      const inputs: KeywordSearchTabInput[] = keywords.map((keyword) => ({
        type: "keyword",
        keyword,
        locationCode: value.locationCode,
        locationName: value.locationName,
        resultLimit: value.resultLimit,
        mode: value.mode,
        clickstream: value.clickstream,
        groupKeywords: value.groupKeywords,
      }));

      for (const tabInput of inputs) {
        searchTabs.openTab(tabInput);
      }
      navigateToKeywordInput(inputs.at(-1) ?? null);
    },
    [navigateToKeywordInput, searchTabs],
  );
  const showRecentSearches = useCallback(() => {
    searchTabs.setActiveTab(null);
    navigateToKeywordInput(null);
  }, [navigateToKeywordInput, searchTabs]);
  const controllerInput = useMemo<ControllerProps>(
    () =>
      activeTab
        ? {
            ...input,
            keywordInput: activeTab.input.keyword,
            locationCode: activeTab.input.locationCode,
            displayedLocationCode:
              activeTab.input.locationCode ?? displayedLocationCode,
            locationName: activeTab.input.locationName,
            setPreferredLocationCode,
            resultLimit: activeTab.input.resultLimit,
            keywordMode: activeTab.input.mode,
            clickstream: activeTab.input.clickstream,
            groupKeywords: activeTab.input.groupKeywords,
          }
        : {
            ...input,
            locationCode,
            displayedLocationCode,
            setPreferredLocationCode,
          },
    [
      activeTab,
      input,
      displayedLocationCode,
      locationCode,
      setPreferredLocationCode,
    ],
  );
  const controller = useKeywordResearchController({
    ...controllerInput,
    onFormSubmit,
  });

  return (
    <div className="px-4 py-4 md:px-6 md:py-6 pb-24 md:pb-8 overflow-auto">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <PageHeader
          title="Keyword Research"
          description="Discover keyword ideas, search demand, and ranking opportunities."
          backLink={
            controller.hasSearched ? (
              <BackButton
                data-testid="keyword-research-recent-searches"
                onClick={showRecentSearches}
              >
                Recent searches
              </BackButton>
            ) : undefined
          }
        />

        <KeywordResearchSearchBar controller={controller} />
        {controller.hasSearched ? (
          <SearchTabStrip
            projectId={projectId}
            tabs={searchTabs.tabs}
            activeTabId={searchTabs.activeTabId}
            onSelect={searchTabs.selectTab}
            onClose={searchTabs.closeTab}
            onViewed={searchTabs.markTabViewed}
          />
        ) : null}
        <KeywordResearchContent
          controller={controller}
          projectId={input.projectId}
        />
        <KeywordSaveDialog controller={controller} />
      </div>
    </div>
  );
}

function KeywordResearchContent({
  controller,
  projectId,
}: {
  controller: KeywordResearchControllerState;
  projectId: string;
}) {
  if (controller.isLoading) {
    return <KeywordResearchLoadingState />;
  }

  const errorCard = controller.researchError ? (
    <ResearchErrorCard
      controller={controller}
      message={controller.researchError}
    />
  ) : null;

  if (controller.rows.length === 0) {
    return (
      errorCard ?? (
        <KeywordResearchEmptyState
          controller={controller}
          projectId={projectId}
        />
      )
    );
  }

  // A failed refetch keeps the loaded results on screen, under the error.
  return (
    <>
      {errorCard}
      <KeywordResearchResults controller={controller} />
    </>
  );
}

function ResearchErrorCard({
  controller,
  message,
}: {
  controller: KeywordResearchControllerState;
  message: string;
}) {
  const errorCode = getErrorCode(controller.researchMutationError);

  return (
    <div className="mx-auto w-full max-w-xl pt-1">
      {errorCode === "INSUFFICIENT_CREDITS" ? (
        <InsufficientCreditsError />
      ) : (
        <ErrorState
          message={message}
          onRetry={
            errorCode === "UNKNOWN_LOCATION"
              ? undefined
              : controller.retrySearch
          }
          isRetrying={controller.researchRetrying}
        />
      )}
    </div>
  );
}

function KeywordSaveDialog({
  controller,
}: {
  controller: KeywordResearchControllerState;
}) {
  if (!controller.showSaveDialog) return null;

  return (
    <FormDialog
      title={`Save ${controller.selectedKeywordRows.length} Keywords`}
      onClose={() => controller.setShowSaveDialog(false)}
      actions={
        <>
          <Button
            variant="outline"
            onClick={() => controller.setShowSaveDialog(false)}
          >
            Cancel
          </Button>
          <Button
            pending={controller.savePending}
            onClick={controller.confirmSave}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-2 text-sm text-muted-foreground">
        <p>These keywords will be saved to your current project.</p>
        {controller.locationName ? (
          <p>
            Saved keywords show national metrics. The local volume for{" "}
            {formatLocationLabel(controller.locationName)} is not saved.
          </p>
        ) : null}
      </div>
    </FormDialog>
  );
}
