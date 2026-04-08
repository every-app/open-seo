import { Link } from "@tanstack/react-router";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { getErrorCode } from "@/client/lib/error-messages";
import { BILLING_ROUTE } from "@/shared/billing";
import { useKeywordResearchController } from "@/client/features/keywords/state/useKeywordResearchController";
import type { KeywordResearchControllerInput } from "@/client/features/keywords/state/useKeywordResearchController";
import { KeywordResearchEmptyState } from "./KeywordResearchEmptyState";
import { KeywordResearchLoadingState } from "./KeywordResearchLoadingState";
import { KeywordResearchResults } from "./KeywordResearchResults";
import { KeywordResearchSearchBar } from "./KeywordResearchSearchBar";
import type { KeywordResearchControllerState } from "./types";

type Props = KeywordResearchControllerInput & {
  onShowRecentSearches: () => void;
};

export function KeywordResearchPage({ onShowRecentSearches, ...input }: Props) {
  const controller = useKeywordResearchController(input);
  const handleShowRecentSearches = () => {
    controller.resetView();
    onShowRecentSearches();
  };

  return (
    <div className="px-4 py-4 md:px-6 md:py-6 pb-24 md:pb-8 overflow-auto">
      <div className="mx-auto max-w-7xl space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Keyword Research</h1>
          <p className="text-sm text-base-content/70">
            Discover keyword ideas, search demand, and ranking opportunities.
          </p>
        </div>

        <KeywordResearchSearchBar controller={controller} />
        <KeywordResearchContent
          controller={controller}
          onShowRecentSearches={handleShowRecentSearches}
        />
        <KeywordSaveDialog controller={controller} />
      </div>
    </div>
  );
}

function KeywordResearchContent({
  controller,
  onShowRecentSearches,
}: {
  controller: KeywordResearchControllerState;
  onShowRecentSearches: () => void;
}) {
  const recentSearchesButton = controller.hasSearched ? (
    <div>
      <button
        type="button"
        className="btn btn-ghost btn-sm gap-2 px-0 text-base-content/70 hover:bg-transparent"
        onClick={onShowRecentSearches}
      >
        <ArrowLeft className="size-4" />
        Recent searches
      </button>
    </div>
  ) : null;

  if (controller.isLoading) {
    return <KeywordResearchLoadingState />;
  }

  if (controller.researchError) {
    const isCreditsError =
      getErrorCode(controller.researchMutationError) === "INSUFFICIENT_CREDITS";

    return (
      <div className="space-y-4 pt-1">
        {recentSearchesButton}
        <div className="flex-1 flex items-center justify-center">
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
              <button
                className="btn btn-sm"
                onClick={() => controller.onSearch()}
              >
                Try again
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (controller.rows.length === 0) {
    return (
      <div className="space-y-4 pt-1">
        {recentSearchesButton}
        <KeywordResearchEmptyState controller={controller} />
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-1">
      {recentSearchesButton}
      <KeywordResearchResults controller={controller} />
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
