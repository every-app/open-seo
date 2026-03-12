import { AlertCircle } from "lucide-react";
import { useKeywordResearchController } from "@/client/features/keywords/state/useKeywordResearchController";
import type { KeywordResearchControllerInput } from "@/client/features/keywords/state/useKeywordResearchController";
import { KeywordResearchEmptyState } from "./KeywordResearchEmptyState";
import { KeywordResearchLoadingState } from "./KeywordResearchLoadingState";
import { KeywordResearchResults } from "./KeywordResearchResults";
import { KeywordResearchSearchBar } from "./KeywordResearchSearchBar";
import type { KeywordResearchControllerState } from "./types";

type Props = KeywordResearchControllerInput;

export function KeywordResearchPage(props: Props) {
  const controller = useKeywordResearchController(props);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <KeywordResearchSearchBar controller={controller} />
      <KeywordResearchContent controller={controller} />
      <KeywordSaveDialog controller={controller} />
    </div>
  );
}

function KeywordResearchContent({
  controller,
}: {
  controller: KeywordResearchControllerState;
}) {
  if (controller.isLoading) {
    return <KeywordResearchLoadingState />;
  }

  if (controller.researchError) {
    return (
      <div className="flex-1 flex items-center justify-center px-4 md:px-6">
        <div className="w-full max-w-xl rounded-xl border border-error/30 bg-error/10 p-5 text-error space-y-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <p className="text-sm">{controller.researchError}</p>
          </div>
          <button className="btn btn-sm" onClick={() => controller.onSearch()}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (controller.rows.length === 0) {
    return <KeywordResearchEmptyState controller={controller} />;
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
