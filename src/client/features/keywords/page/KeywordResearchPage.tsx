import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { getErrorCode } from "@/client/lib/error-messages";
import { BILLING_ROUTE } from "@/shared/billing";
import {
  KEYWORD_RESEARCH_STALE_TIME_MS,
  buildKeywordResearchQueryKey,
  buildKeywordResearchRequest,
  keywordResearchQueryFn,
} from "@/client/features/keywords/hooks/useKeywordResearchData";
import { useKeywordResearchController } from "@/client/features/keywords/state/useKeywordResearchController";
import type { KeywordResearchControllerInput } from "@/client/features/keywords/state/useKeywordResearchController";
import type { KeywordControlsValues } from "@/client/features/keywords/hooks/useKeywordControlsForm";
import {
  parseKeywordInput,
  buildKeywordSearchKey,
} from "@/client/features/keywords/state/keywordControllerActions";
import { useKeywordSearchParams } from "@/client/features/keywords/state/keywordControllerInternals";
import { useKeywordTabs } from "@/client/features/keywords/state/useKeywordTabs";
import {
  getKeywordTabsSnapshot,
  type OpenTabInput,
} from "@/client/features/keywords/state/keywordTabsStore";
import { DEFAULT_LOCATION_CODE } from "@/client/features/keywords/locations";
import { KeywordResearchEmptyState } from "./KeywordResearchEmptyState";
import { KeywordResearchLoadingState } from "./KeywordResearchLoadingState";
import { KeywordResearchResults } from "./KeywordResearchResults";
import { KeywordResearchSearchBar } from "./KeywordResearchSearchBar";
import { KeywordResearchTabStrip } from "./KeywordResearchTabStrip";
import type { KeywordResearchControllerState } from "./types";

type Props = Omit<KeywordResearchControllerInput, "onFormSubmit">;

export function KeywordResearchPage(input: Props) {
  const tabs = useKeywordTabs(input.projectId);
  const { openTabs, setActiveTab, findMatchingTab } = tabs;
  const setSearchParams = useKeywordSearchParams();
  const projectId = input.projectId;

  const setSearchParamsForTab = useCallback(
    (tab: OpenTabInput | null) => {
      if (!tab) {
        setSearchParams({
          q: undefined,
          loc: undefined,
          kLimit: undefined,
          mode: undefined,
        });
        return;
      }

      setSearchParams({
        q: tab.keyword,
        loc:
          tab.locationCode === DEFAULT_LOCATION_CODE
            ? undefined
            : tab.locationCode,
        kLimit: tab.resultLimit === 150 ? undefined : tab.resultLimit,
        mode: tab.mode === "auto" ? undefined : tab.mode,
      });
    },
    [setSearchParams],
  );

  const urlInput = useMemo<OpenTabInput | null>(() => {
    const keywords = parseKeywordInput(input.keywordInput);
    const keyword = keywords[0];
    if (!keyword) return null;
    return {
      keyword,
      locationCode: input.locationCode,
      resultLimit: input.resultLimit,
      mode: input.keywordMode,
    };
  }, [
    input.keywordInput,
    input.keywordMode,
    input.locationCode,
    input.resultLimit,
  ]);
  const currentUrlKey = useMemo(
    () =>
      buildKeywordSearchKey({
        keyword: input.keywordInput,
        locationCode: input.locationCode,
        resultLimit: input.resultLimit,
        mode: input.keywordMode,
      }),
    [
      input.keywordInput,
      input.keywordMode,
      input.locationCode,
      input.resultLimit,
    ],
  );

  // Effect: URL → activeTab. When the URL params resolve to a tab we already
  // have, focus it. Otherwise create one matching the URL (handles deep links
  // and back/forward navigation).
  useEffect(() => {
    if (!urlInput) {
      if (getKeywordTabsSnapshot(projectId).activeTabId !== null) {
        setActiveTab(null);
      }
      return;
    }

    const existing = findMatchingTab(urlInput);
    if (existing) {
      if (getKeywordTabsSnapshot(projectId).activeTabId !== existing.id) {
        setActiveTab(existing.id);
      }
      return;
    }

    openTabs([urlInput]);
  }, [urlInput, projectId, openTabs, setActiveTab, findMatchingTab]);

  // Effect: activeTab → URL. After user actions (click tab, close tab, open
  // tabs from a multi-keyword submit) the active tab can diverge from the URL.
  // Re-align the URL so the controller below keeps reading the right query.
  const activeTab = tabs.activeTab;
  const activeTabUrlKey = useMemo(
    () =>
      activeTab
        ? buildKeywordSearchKey({
            keyword: activeTab.keyword,
            locationCode: activeTab.locationCode,
            resultLimit: activeTab.resultLimit,
            mode: activeTab.mode,
          })
        : null,
    [activeTab],
  );
  useEffect(() => {
    if (!activeTab) return;

    if (currentUrlKey === activeTabUrlKey) return;

    setSearchParamsForTab(activeTab);
  }, [
    activeTab,
    activeTab?.id,
    activeTab?.keyword,
    activeTab?.locationCode,
    activeTab?.resultLimit,
    activeTab?.mode,
    activeTabUrlKey,
    currentUrlKey,
    setSearchParamsForTab,
  ]);

  const onFormSubmit = useCallback(
    (value: KeywordControlsValues) => {
      const keywords = parseKeywordInput(value.keyword);
      if (keywords.length === 0) return;

      const inputs: OpenTabInput[] = keywords.map((keyword) => ({
        keyword,
        locationCode: value.locationCode,
        resultLimit: value.resultLimit,
        mode: value.mode,
      }));

      const result = openTabs(inputs);
      if (result.activeTab) setSearchParamsForTab(result.activeTab);
    },
    [openTabs, setSearchParamsForTab],
  );
  const closeTab = useCallback(
    (tabId: string) => {
      const result = tabs.closeTab(tabId);
      if (result.closedActive) {
        setSearchParamsForTab(result.nextActiveTab);
      }
    },
    [setSearchParamsForTab, tabs],
  );
  const getOpenKeywordTabs = useCallback(
    () => getKeywordTabsSnapshot(projectId).tabs,
    [projectId],
  );

  const controllerInput = useMemo<Props>(
    () =>
      activeTab
        ? {
            ...input,
            keywordInput: activeTab.keyword,
            locationCode: activeTab.locationCode,
            hasExplicitLocationCode: true,
            resultLimit: activeTab.resultLimit,
            keywordMode: activeTab.mode,
            getOpenKeywordTabs,
            keywordTabsLimit: tabs.limit,
          }
        : {
            ...input,
            getOpenKeywordTabs,
            keywordTabsLimit: tabs.limit,
          },
    [activeTab, getOpenKeywordTabs, input, tabs.limit],
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
  }, [controller.controlsForm, tabs.tabs]);

  // Mark the active tab as viewed once its data lands. Reads cache state via
  // the same query key the controller uses, so this catches both fresh fetches
  // and warm-cache loads on tab switch.
  const activeRequest = useMemo(
    () =>
      activeTab
        ? buildKeywordResearchRequest({
            projectId,
            keywordInput: activeTab.keyword,
            locationCode: activeTab.locationCode,
            resultLimit: activeTab.resultLimit,
            mode: activeTab.mode,
          })
        : null,
    [activeTab, projectId],
  );
  const activeTabQuery = useQuery({
    queryKey: buildKeywordResearchQueryKey(activeRequest),
    queryFn: () => {
      if (!activeRequest) throw new Error("Active tab missing request");
      return keywordResearchQueryFn(activeRequest);
    },
    enabled: false,
    staleTime: KEYWORD_RESEARCH_STALE_TIME_MS,
    gcTime: KEYWORD_RESEARCH_STALE_TIME_MS,
  });

  const markTabViewed = tabs.markTabViewed;
  useEffect(() => {
    if (!activeTab) return;
    if (!activeTabQuery.isSuccess) return;
    const dataUpdatedAt = activeTabQuery.dataUpdatedAt;
    if (dataUpdatedAt <= 0) return;
    if (activeTab.viewedAt !== null && activeTab.viewedAt >= dataUpdatedAt) {
      return;
    }
    markTabViewed(activeTab.id, dataUpdatedAt);
  }, [
    activeTab,
    activeTabQuery.dataUpdatedAt,
    activeTabQuery.isSuccess,
    markTabViewed,
  ]);

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
            <Link
              from="/p/$projectId/keywords"
              to="/p/$projectId/keywords"
              params={{ projectId }}
              search={{}}
              replace
              className="btn btn-ghost btn-sm w-fit gap-2 px-0 text-base-content/70 hover:bg-transparent"
              onClick={() => {
                setActiveTab(null);
                setSearchParamsForTab(null);
              }}
            >
              <ArrowLeft className="size-4" />
              Recent searches
            </Link>
            <KeywordResearchTabStrip
              projectId={projectId}
              tabs={tabs}
              closeTab={closeTab}
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
