import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  getProjectAiSettings,
  updateProjectAiSettings,
} from "@/serverFunctions/aiSettings";
import { AiModelSelect } from "@/client/features/ai/AiModelSelect";
import { EffectiveModelReadout } from "@/client/features/ai/AiConnectionTest";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import type { AiProviderId } from "@/server/features/ai/providers";

// Per-project override for the in-app agent's provider + model. Empty
// (inherited) state means "use the organization default"; the toggle switches
// between inheriting and pinning a provider/model for this project.

const PROVIDER_LABELS: Record<AiProviderId, string> = {
  openrouter: "OpenRouter",
  openai: "OpenAI",
  gemini: "Google Gemini",
  anthropic: "Anthropic",
  openai_compatible: "OpenAI Compatible",
  ollama_cloud: "Ollama Cloud",
};

export function ProjectAiSettingsSection({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ["aiSettings", "project", projectId],
    queryFn: () => getProjectAiSettings({ data: { projectId } }),
  });
  const [inheriting, setInheriting] = useState<boolean | null>(null);
  const [provider, setProvider] = useState<AiProviderId | null>(null);
  const [model, setModel] = useState<string | null>(null);

  const settings = settingsQuery.data;
  const [lastLoaded, setLastLoaded] = useState<string | null | undefined>(
    undefined,
  );
  if (settings && (settings.project?.model ?? null) !== lastLoaded) {
    setLastLoaded(settings.project?.model ?? null);
    const stored = settings.project?.provider ?? settings.effective.provider;
    const storedEntry = stored
      ? settings.providers.find((entry) => entry.id === stored)
      : undefined;
    setProvider(storedEntry?.id ?? null);
    setModel(settings.project?.model ?? null);
    setInheriting(settings.project === null);
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      updateProjectAiSettings({
        data: {
          projectId,
          provider: provider ?? "openrouter",
          model: inheriting ? undefined : (model ?? undefined),
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["aiSettings"] });
      toast.success("Project AI settings saved");
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Failed to save AI settings")),
  });

  if (settingsQuery.isPending || !settings || inheriting === null) {
    return (
      <div className="flex items-center gap-2">
        <span className="loading loading-spinner loading-sm" />
        <span className="text-sm text-base-content/50">Loading…</span>
      </div>
    );
  }

  const selectedProvider = provider ?? settings.effective.provider ?? "openrouter";
  const providerStatus =
    settings.providers.find((entry) => entry.id === selectedProvider) ?? null;
  const isDirty =
    inheriting !== (settings.project === null) ||
    (!inheriting &&
      ((provider ?? null) !== (settings.project?.provider ?? null) ||
        (model ?? null) !== (settings.project?.model ?? null)));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Use organization default</p>
          <p className="text-xs text-base-content/50">
            Inherit the provider and default model configured in app settings.
          </p>
        </div>
        <input
          type="checkbox"
          className="toggle toggle-primary"
          checked={inheriting}
          onChange={(event) => setInheriting(event.currentTarget.checked)}
          disabled={saveMutation.isPending}
          aria-label="Inherit organization AI settings"
        />
      </div>

      {!inheriting && (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Provider</span>
            <div className="flex flex-wrap gap-2">
              {settings.providers.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => {
                    setProvider(entry.id);
                    setModel(null);
                  }}
                  className={`btn btn-outline btn-sm ${
                    selectedProvider === entry.id ? "btn-primary" : ""
                  }`}
                  aria-pressed={selectedProvider === entry.id}
                >
                  {PROVIDER_LABELS[entry.id] ?? entry.displayName}
                  {entry.configured ? (
                    <span className="text-success">✓</span>
                  ) : (
                    <span
                      className="text-warning"
                      title={`Missing ${entry.envApiKey}`}
                    >
                      Not configured
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Model override</span>
            <AiModelSelect
              provider={selectedProvider}
              value={model}
              onChange={setModel}
              disabled={saveMutation.isPending}
            />
            {providerStatus && (
              <p className="text-xs text-base-content/50">
                {providerStatus.configured
                  ? `${providerStatus.envApiKey} configured server-side.`
                  : `${providerStatus.envApiKey} is not configured — the agent will fail to start until the deployment provides it.`}
              </p>
            )}
          </div>
        </>
      )}

      <EffectiveModelReadout
        effectiveProvider={settings.effective.provider}
        effectiveModel={settings.effective.model}
      />

      <div className="flex justify-end">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !isDirty}
        >
          {saveMutation.isPending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}