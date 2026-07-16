import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo } from "react";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { getErrorCode } from "@/client/lib/error-messages";
import { BILLING_ROUTE } from "@/shared/billing";
import { useKeywordResearchController } from "@/client/features/keywords/state/useKeywordResearchController";
import type { KeywordResearchControllerInput } from "@/client/features/keywords/state/useKeywordResearchController";
import type { KeywordControlsValues } from "@/client/features/keywords/hooks/useKeywordControlsForm";
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
          kLimit: undefined,
          mode: undefined,
          cs: undefined,
        });
        return;
      }

      setSearchParams({
        q: tabInput.keyword,
        loc: tabInput.locationCode,
        kLimit: tabInput.resultLimit === 150 ? undefined : tabInput.resultLimit,
        mode: tabInput.mode === "auto" ? undefined : tabInput.mode,
        cs: tabInput.clickstream ? true : undefined,
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
      resultLimit: input.resultLimit,
      mode: input.keywordMode,
      clickstream: input.clickstream,
    };
  }, [
    input.clickstream,
    input.keywordInput,
    input.keywordMode,
    locationCode,
    input.resultLimit,
  ]);
  const searchTabs = useSearchTabNavigation({
    storageKey: `keyword:${projectId}`,
    urlInput,
    getLabel: useCallback(
      (tabInput) => (tabInput.type === "keyword" ? tabInput.keyword : ""),
      [],
    ),
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
    (value: KeywordControlsValues) => {
      const keywords = parseKeywordInput(value.keyword);
      if (keywords.length === 0) return;

      const inputs: KeywordSearchTabInput[] = keywords.map((keyword) => ({
        type: "keyword",
        keyword,
        locationCode: value.locationCode,
        resultLimit: value.resultLimit,
        mode: value.mode,
        clickstream: value.clickstream,
      }));

      let activeInput: KeywordSearchTabInput | null = null;
      for (const tabInput of inputs) {
        const result = searchTabs.openTab(tabInput);
        if (result.tab?.input.type === "keyword") {
          activeInput = result.tab.input;
        }
      }
      if (activeInput) navigateToKeywordInput(activeInput);
    },
    [navigateToKeywordInput, searchTabs],
  );
  const showRecentSearches = useCallback(() => {
    searchTabs.setActiveTab(null);
    navigateToKeywordInput(null);
  }, [navigateToKeywordInput, searchTabs]);
  const getOpenKeywordTabs = useCallback(
    () =>
      searchTabs.tabs.flatMap((tab) =>
        tab.input.type === "keyword"
          ? [
              {
                keyword: tab.input.keyword,
                locationCode: tab.input.locationCode,
                resultLimit: tab.input.resultLimit,
                mode: tab.input.mode,
                clickstream: tab.input.clickstream,
              },
            ]
          : [],
      ),
    [searchTabs.tabs],
  );

  const controllerInput = useMemo<ControllerProps>(
    () =>
      activeTab
        ? {
            ...input,
            keywordInput: activeTab.input.keyword,
            locationCode: activeTab.input.locationCode,
            displayedLocationCode:
              activeTab.input.locationCode ?? displayedLocationCode,
            setPreferredLocationCode,
            resultLimit: activeTab.input.resultLimit,
            keywordMode: activeTab.input.mode,
            clickstream: activeTab.input.clickstream,
            getOpenKeywordTabs,
            keywordTabsLimit: searchTabs.limit,
          }
        : {
            ...input,
            locationCode,
            displayedLocationCode,
            setPreferredLocationCode,
            getOpenKeywordTabs,
            keywordTabsLimit: searchTabs.limit,
          },
    [
      activeTab,
      getOpenKeywordTabs,
      input,
      displayedLocationCode,
      locationCode,
      searchTabs.limit,
      setPreferredLocationCode,
    ],
  );
  const controller = useKeywordResearchController({
    ...controllerInput,
    onFormSubmit,
  });
  useEffect(() => {
    controller.controlsForm.setErrorMap({ onSubmit: undefined });
    controller.controlsForm.setFieldMeta("keyword", (meta) => ({
      ...meta,
      errorMap: {
        ...meta.errorMap,
        onSubmit: undefined,
      },
      errorSourceMap: {
        ...meta.errorSourceMap,
        onSubmit: undefined,
      },
    }));
  }, [controller.controlsForm, searchTabs.tabs]);

  return (
    <div className="px-4 py-4 md:px-6 md:py-6 pb-24 md:pb-8 overflow-auto">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <div>
          <h1 className="text-2xl font-semibold">Keyword Research</h1>
          <p className="text-sm text-base-content/70">
            Discover keyword ideas, search demand, and ranking opportunities.
          </p>
        </div>

        <KeywordResearchSearchBar controller={controller} />
        {controller.hasSearched ? (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              data-testid="keyword-research-recent-searches"
              className="btn btn-ghost btn-sm w-fit gap-2 px-0 text-base-content/70 hover:bg-transparent"
              onClick={showRecentSearches}
            >
              <ArrowLeft className="size-4" />
              Recent searches
            </button>
            <SearchTabStrip
              projectId={projectId}
              tabs={searchTabs.tabs}
              activeTabId={searchTabs.activeTabId}
              onSelect={searchTabs.selectTab}
              onClose={searchTabs.closeTab}
              onViewed={searchTabs.markTabViewed}
            />
          </div>
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

  if (controller.researchError) {
    const isCreditsError =
      getErrorCode(controller.researchMutationError) === "INSUFFICIENT_CREDITS";

    return (
      <div className="flex-1 flex items-center justify-center pt-1">
        <div className="w-full max-w-xl rounded-xl border border-error/30 bg-error/10 p-5 text-error space-y-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <p className="text-sm">{controller.researchError}</p>
          </div>
          {isCreditsError ? (
            <Link to={BILLING_ROUTE} className="btn btn-sm">
              Go to Billing
            </Link>
          ) : (
            <button className="btn btn-sm" onClick={controller.retrySearch}>
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  if (controller.rows.length === 0) {
    return (
      <KeywordResearchEmptyState
        controller={controller}
        projectId={projectId}
      />
    );
  }

  return <KeywordResearchResults controller={controller} />;
}

function KeywordSaveDialog({
  controller,
}: {
  controller: KeywordResearchControllerState;
}) {
  if (!controller.showSaveDialog) return null;

  return (
    <div className="modal modal-open">
      <div className="modal-box">
        <h3 className="font-bold text-lg">
          Save {controller.selectedRows.size} Keywords
        </h3>
        <div className="py-4">
          <p className="text-base-content/70 text-sm">
            These keywords will be saved to your current project.
          </p>
        </div>
        <div className="modal-action">
          <button
            className="btn"
            onClick={() => controller.setShowSaveDialog(false)}
          >
            Cancel
          </button>
          <button className="btn btn-primary" onClick={controller.confirmSave}>
            Save
          </button>
        </div>
      </div>
      <div
        className="modal-backdrop"
        onClick={() => controller.setShowSaveDialog(false)}
      />
    </div>
  );
}
