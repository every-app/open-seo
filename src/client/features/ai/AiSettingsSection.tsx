import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
  getGlobalAiSettings,
  updateGlobalAiSettings,
} from "@/serverFunctions/aiSettings";
import { AiModelSelect } from "@/client/features/ai/AiModelSelect";
import {
  AiConnectionTest,
  EffectiveModelReadout,
} from "@/client/features/ai/AiConnectionTest";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

// Global (organization) AI agent settings: which provider and default model the
// in-app agent uses. Credentials are never stored in the app — the key status
// below reflects the server-side deployment secret, which is why this section
// can't accept or change a key.

export function AiSettingsSection() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ["aiSettings", "global"],
    queryFn: () => getGlobalAiSettings(),
  });
  const [model, setModel] = useState<string | null>(null);

  const settings = settingsQuery.data;

  const saveMutation = useMutation({
    mutationFn: () =>
      updateGlobalAiSettings({
        data: { provider: "openrouter", model: model ?? undefined },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["aiSettings"] });
      toast.success("AI settings saved");
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Failed to save AI settings")),
  });

  // Reset local state when the server data arrives/changes (e.g. another tab).
  const [lastLoadedModel, setLastLoadedModel] = useState<string | null | undefined>(undefined);
  if (settings && settings.organization?.model !== lastLoadedModel) {
    setLastLoadedModel(settings.organization?.model ?? null);
    setModel(settings.organization?.model ?? null);
  }

  if (settingsQuery.isPending || !settings) {
    return (
      <div className="flex items-center gap-2">
        <span className="loading loading-spinner loading-sm" />
        <span className="text-sm text-base-content/50">Loading…</span>
      </div>
    );
  }

  const isDirty = (model ?? null) !== (settings.organization?.model ?? null);
  const currentModel = model ?? settings.effective.model;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Provider</span>
        <span className="text-sm">OpenRouter</span>
        <p className="text-xs text-base-content/50">
          Provider support is extensible; OpenRouter is the only provider
          available right now.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Default model</span>
        <AiModelSelect
          value={model}
          onChange={setModel}
          disabled={saveMutation.isPending}
        />
        <EffectiveModelReadout effectiveModel={settings.effective.model} />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">API key</span>
        {settings.apiKeyConfigured ? (
          <p className="text-sm text-success">
            Configured server-side ({settings.maskedApiKey})
          </p>
        ) : (
          <p className="text-sm text-warning">
            Not configured. The in-app agent (SAM) is disabled until the
            deployment provides an OpenRouter key.
          </p>
        )}
        <p className="text-xs text-base-content/50">
          Keys are managed by the deployment, never stored in OpenSEO.
          {!settings.apiKeyConfigured && (
            <>
              {" "}
              See the{" "}
              <Link
                to="/help/openrouter-api-key"
                className="link link-primary"
              >
                OpenRouter key guide
              </Link>
              .
            </>
          )}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Connection</span>
        <AiConnectionTest
          model={currentModel ?? ""}
          apiKeyConfigured={settings.apiKeyConfigured}
        />
      </div>

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