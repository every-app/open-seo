import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Columns3,
  SearchCheck,
  Sparkles,
} from "lucide-react";
import { explorePrompt } from "@/serverFunctions/ai-search";
import {
  HostedPlanGate,
  type HostedPlanGateState,
} from "@/client/features/billing/HostedPlanGate";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { PromptExplorerForm } from "@/client/features/ai-search/components/PromptExplorerForm";
import { PromptExplorerResults } from "@/client/features/ai-search/components/PromptExplorerResults";
import { PromptExplorerLoadingState } from "@/client/features/ai-search/components/PromptExplorerLoadingState";
import { PromptExplorerHistorySection } from "@/client/features/ai-search/components/PromptExplorerHistorySection";
import { AiSearchPaidPlanGate } from "@/client/features/ai-search/components/AiSearchPaidPlanGate";
import {
  AiSearchAccessLoadingState,
  AiSearchSetupGate,
} from "@/client/features/ai-search/components/AiSearchSetupGate";
import { useAiSearchAccess } from "@/client/features/ai-search/useAiSearchAccess";
import {
  usePromptExplorerSearchHistory,
  type PromptExplorerSearchHistoryItem,
} from "@/client/hooks/usePromptExplorerSearchHistory";
import {
  PROMPT_EXPLORER_MAX_PROMPT_LENGTH,
  PROMPT_EXPLORER_MODELS,
  type PromptExplorerModel,
  type WebSearchCountryCode,
} from "@/types/schemas/ai-search";

type Props = {
  projectId: string;
};

const PROMPT_EXPLORER_BULLETS = [
  {
    icon: Columns3,
    title: "Four models side-by-side",
    body: "Run one prompt across ChatGPT, Claude, Gemini, and Perplexity and compare answers in a single view.",
  },
  {
    icon: SearchCheck,
    title: "See what the models cite",
    body: "Every answer lists the sources it drew from, so you can audit where each model gets its information.",
  },
  {
    icon: Sparkles,
    title: "Check brand mentions",
    body: "Highlight a brand to instantly see whether it shows up in the answer text or the cited sources.",
  },
];

type FormState = {
  prompt: string;
  highlightBrand: string;
  models: PromptExplorerModel[];
  webSearch: boolean;
  webSearchCountryCode: WebSearchCountryCode;
};

const INITIAL_FORM_STATE: FormState = {
  prompt: "",
  highlightBrand: "",
  models: [...PROMPT_EXPLORER_MODELS],
  webSearch: true,
  webSearchCountryCode: "US",
};

export function PromptExplorerPage(props: Props) {
  return (
    <HostedPlanGate>
      {(planGate) => <PromptExplorerPageInner {...props} planGate={planGate} />}
    </HostedPlanGate>
  );
}

function PromptExplorerPageInner({
  projectId,
  planGate,
}: Props & { planGate: HostedPlanGateState }) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM_STATE);
  const [validationError, setValidationError] = useState<string | null>(null);
  const access = useAiSearchAccess(projectId);

  const {
    history,
    isLoaded: historyLoaded,
    addSearch,
    removeHistoryItem,
  } = usePromptExplorerSearchHistory(projectId);

  const exploreMutation = useMutation({
    mutationFn: (input: FormState) =>
      explorePrompt({
        data: {
          projectId,
          prompt: input.prompt,
          models: input.models,
          highlightBrand:
            input.highlightBrand.length > 0 ? input.highlightBrand : undefined,
          webSearch: input.webSearch,
          webSearchCountryCode: input.webSearchCountryCode,
        },
      }),
  });

  const runExplore = (values: FormState) => {
    const normalized: FormState = {
      ...values,
      prompt: values.prompt.trim(),
      highlightBrand: values.highlightBrand.trim(),
    };
    addSearch({
      prompt: normalized.prompt,
      highlightBrand: normalized.highlightBrand,
      models: normalized.models,
      webSearch: normalized.webSearch,
      webSearchCountryCode: normalized.webSearchCountryCode,
    });
    exploreMutation.mutate(normalized);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmedPrompt = form.prompt.trim();
    if (trimmedPrompt.length === 0) {
      setValidationError("Enter a prompt");
      return;
    }
    if (trimmedPrompt.length > PROMPT_EXPLORER_MAX_PROMPT_LENGTH) {
      setValidationError(
        `Keep prompts under ${PROMPT_EXPLORER_MAX_PROMPT_LENGTH} characters`,
      );
      return;
    }
    if (form.models.length === 0) {
      setValidationError("Select at least one model");
      return;
    }
    setValidationError(null);
    runExplore(form);
  };

  const handleSelectHistoryItem = (item: PromptExplorerSearchHistoryItem) => {
    const nextForm: FormState = {
      prompt: item.prompt,
      highlightBrand: item.highlightBrand,
      models: item.models,
      webSearch: item.webSearch,
      webSearchCountryCode: item.webSearchCountryCode,
    };
    setForm(nextForm);
    setValidationError(null);
    runExplore(nextForm);
  };

  const handleShowRecentSearches = () => {
    exploreMutation.reset();
    setForm(INITIAL_FORM_STATE);
    setValidationError(null);
  };

  const errorMessage = exploreMutation.isError
    ? getStandardErrorMessage(exploreMutation.error)
    : null;

  const updateForm = <K extends keyof FormState>(
    key: K,
    value: FormState[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (validationError) setValidationError(null);
  };

  if (planGate.isLoading) return null;

  return (
    <div className="px-4 py-4 pb-24 overflow-auto md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-7xl space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Prompt Explorer</h1>
          <p className="text-sm text-base-content/70">
            Ask any prompt across ChatGPT, Claude, Gemini, and Perplexity
            side-by-side.
          </p>
        </div>

        {access.isLoading ? (
          <AiSearchAccessLoadingState />
        ) : !access.enabled ? (
          <AiSearchSetupGate
            errorMessage={access.errorMessage ?? access.statusErrorMessage}
            isRefetching={access.isRefetching}
            onRetry={access.onRetry}
          />
        ) : planGate.isFreePlan ? (
          <AiSearchPaidPlanGate
            feature="Prompt Explorer"
            description="Ask one prompt across ChatGPT, Claude, Gemini, and Perplexity at the same time and compare their answers — including which sources each model cites."
            bullets={PROMPT_EXPLORER_BULLETS}
          />
        ) : (
          <>
            <PromptExplorerForm
              form={form}
              onPromptChange={(value) => updateForm("prompt", value)}
              onHighlightBrandChange={(value) =>
                updateForm("highlightBrand", value)
              }
              onModelsChange={(value) => updateForm("models", value)}
              onWebSearchChange={(value) => updateForm("webSearch", value)}
              onCountryChange={(value) =>
                updateForm("webSearchCountryCode", value)
              }
              onSubmit={handleSubmit}
              isLoading={exploreMutation.isPending}
              validationError={validationError}
            />

            {errorMessage ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            ) : null}

            {exploreMutation.isPending ? (
              <PromptExplorerLoadingState modelCount={form.models.length} />
            ) : exploreMutation.data ? (
              <>
                <div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm gap-2 px-0 text-base-content/70 hover:bg-transparent"
                    onClick={handleShowRecentSearches}
                  >
                    <ArrowLeft className="size-4" />
                    Recent searches
                  </button>
                </div>
                <PromptExplorerResults result={exploreMutation.data} />
              </>
            ) : !errorMessage ? (
              <PromptExplorerHistorySection
                history={history}
                historyLoaded={historyLoaded}
                onRemoveHistoryItem={removeHistoryItem}
                onSelectHistoryItem={handleSelectHistoryItem}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
