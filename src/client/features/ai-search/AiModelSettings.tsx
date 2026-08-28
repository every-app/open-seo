import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  formatModelLabel,
  formatModelVersionLabel,
  getModelAccent,
} from "@/client/features/ai-search/platformLabels";
import {
  getAiModelSettings,
  updateAiModelSettings,
} from "@/serverFunctions/ai-search";
import {
  isModelVersion,
  PROMPT_EXPLORER_MODEL_DEFAULTS,
  PROMPT_EXPLORER_MODEL_VERSIONS,
  PROMPT_EXPLORER_MODELS,
  type PromptExplorerModel,
  type PromptExplorerModelVersions,
} from "@/types/schemas/ai-search";

const PROVIDER_NOTES: Record<PromptExplorerModel, string> = {
  chat_gpt: "OpenAI's assistant, the most-used AI answer surface.",
  claude: "Anthropic's assistant.",
  gemini: "Google's assistant.",
  perplexity: "AI search engine that cites its sources.",
};

export function AiModelSettings({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ["ai-model-settings", projectId],
    queryFn: () => getAiModelSettings({ data: { projectId } }),
  });

  if (settingsQuery.isPending) {
    return (
      <div className="flex justify-center py-10">
        <span className="loading loading-spinner loading-md" />
      </div>
    );
  }
  if (settingsQuery.isError) {
    return (
      <p className="text-sm text-error">
        {getStandardErrorMessage(
          settingsQuery.error,
          "Failed to load model settings",
        )}
      </p>
    );
  }

  return (
    <SettingsForm
      key={JSON.stringify(settingsQuery.data)}
      projectId={projectId}
      saved={settingsQuery.data}
      onSaved={(next) =>
        queryClient.setQueryData(["ai-model-settings", projectId], next)
      }
    />
  );
}

function SettingsForm({
  projectId,
  saved,
  onSaved,
}: {
  projectId: string;
  saved: PromptExplorerModelVersions;
  onSaved: (next: PromptExplorerModelVersions) => void;
}) {
  const [versions, setVersions] = React.useState<PromptExplorerModelVersions>(
    () => ({
      ...saved,
    }),
  );

  const updateMutation = useMutation({
    mutationFn: () =>
      updateAiModelSettings({ data: { projectId, modelVersions: versions } }),
    onSuccess: (next) => {
      onSaved(next);
      toast.success("Model settings saved");
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Failed to save settings")),
  });

  const effective = (model: PromptExplorerModel) =>
    versions[model] ?? PROMPT_EXPLORER_MODEL_DEFAULTS[model];

  const setVersion = (model: PromptExplorerModel, version: string) => {
    setVersions((prev) => {
      const next = { ...prev };
      if (
        !isModelVersion(model, version) ||
        version === PROMPT_EXPLORER_MODEL_DEFAULTS[model]
      ) {
        delete next[model];
      } else {
        (next as Record<PromptExplorerModel, string>)[model] = version;
      }
      return next;
    });
  };

  const isDirty = PROMPT_EXPLORER_MODELS.some(
    (model) => (versions[model] ?? null) !== (saved[model] ?? null),
  );

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (updateMutation.isPending || !isDirty) return;
    updateMutation.mutate();
  };

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-sm font-medium text-base-content/50">AI Models</h2>
        <p className="text-sm text-base-content/70">
          The model version each provider answers with in{" "}
          <Link
            to="/p/$projectId/prompt-explorer"
            params={{ projectId }}
            className="link"
          >
            Prompt Explorer
          </Link>
          . &ldquo;App default&rdquo; tracks the version this app targets, which
          follows what each provider currently serves its users. A single run
          can still pick a different version without changing these settings.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="divide-y divide-base-300 rounded-lg border border-base-300 bg-base-100">
          {PROMPT_EXPLORER_MODELS.map((model) => {
            const accent = getModelAccent(model);
            const isCustom = versions[model] != null;
            return (
              <div
                key={model}
                className="flex flex-wrap items-center gap-3 p-4"
              >
                <span
                  className={`size-2.5 shrink-0 rounded-full ${accent.dot}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {formatModelLabel(model)}
                    </span>
                    {isCustom ? (
                      <span className="badge badge-ghost badge-sm">custom</span>
                    ) : null}
                  </div>
                  <p className="text-xs text-base-content/60">
                    {PROVIDER_NOTES[model]}
                  </p>
                </div>
                <select
                  aria-label={`${formatModelLabel(model)} default model version`}
                  className="select select-bordered select-sm w-full sm:w-56"
                  value={effective(model)}
                  onChange={(event) => setVersion(model, event.target.value)}
                >
                  {PROMPT_EXPLORER_MODEL_VERSIONS[model].map((version) => (
                    <option key={version} value={version}>
                      {formatModelVersionLabel(version)}
                      {version === PROMPT_EXPLORER_MODEL_DEFAULTS[model]
                        ? " (app default)"
                        : ""}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-3">
          {isDirty ? (
            <span className="text-xs text-base-content/50">
              Unsaved changes
            </span>
          ) : null}
          <button
            type="submit"
            className="btn btn-primary btn-sm px-6"
            disabled={!isDirty || updateMutation.isPending}
          >
            {updateMutation.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </section>
  );
}
