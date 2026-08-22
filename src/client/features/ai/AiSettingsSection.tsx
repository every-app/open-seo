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
import type { AiProviderId } from "@/server/features/ai/providers";
import type { AiProviderStatus } from "@/serverFunctions/aiSettings";

// Global (organization) AI agent settings: which provider and default model the
// in-app agent uses. Credentials are never stored in the app — the key status
// below reflects the server-side deployment secrets, which is why this section
// can't accept or change a key.

const PROVIDER_LABELS: Record<AiProviderId, string> = {
  openrouter: "OpenRouter",
  openai: "OpenAI",
  gemini: "Google Gemini",
  anthropic: "Anthropic",
};

function CapabilityRow({ provider }: { provider: AiProviderStatus }) {
  const caps: Array<[string, boolean]> = [
    ["Tool calling", provider.capabilities.toolCalling],
    ["Streaming", provider.capabilities.streaming],
    ["Model discovery", provider.capabilities.modelDiscovery],
  ];
  return (
    <p className="text-xs text-base-content/50">
      {caps.map(([label, supported]) => (
        <span key={label} className="mr-3">
          {supported ? (
            <span className="text-success">✓ {label}</span>
          ) : (
            <span className="text-base-content/40">— {label}</span>
          )}
        </span>
      ))}
    </p>
  );
}

export function AiSettingsSection() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ["aiSettings", "global"],
    queryFn: () => getGlobalAiSettings(),
  });
  const [provider, setProvider] = useState<AiProviderId | null>(null);
  const [model, setModel] = useState<string | null>(null);

  const settings = settingsQuery.data;

  const saveMutation = useMutation({
    mutationFn: () =>
      updateGlobalAiSettings({
        data: { provider: provider ?? "openrouter", model: model ?? undefined },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["aiSettings"] });
      toast.success("AI settings saved");
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Failed to save AI settings")),
  });

  // Reset local state when the server data arrives/changes (e.g. another tab).
  const [lastLoaded, setLastLoaded] = useState<string | null | undefined>(undefined);
  if (
    settings &&
    (settings.organization?.provider ?? null) !== lastLoaded
  ) {
    setLastLoaded(settings.organization?.provider ?? null);
    const stored = settings.organization?.provider ?? settings.effective.provider;
    const storedEntry = stored
      ? settings.providers.find((entry) => entry.id === stored)
      : undefined;
    setProvider(storedEntry?.id ?? null);
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

  const selectedProvider = provider ?? settings.effective.provider ?? "openrouter";
  const providerStatus =
    settings.providers.find((entry) => entry.id === selectedProvider) ?? null;
  const isDirty =
    (provider ?? null) !== (settings.organization?.provider ?? null) ||
    (model ?? null) !== (settings.organization?.model ?? null);
  const currentModel = model ?? settings.effective.model;

  return (
    <div className="space-y-4">
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
                <span className="text-warning" title={`Missing ${entry.envApiKey}`}>
                  Not configured
                </span>
              )}
            </button>
          ))}
        </div>
        <p className="text-xs text-base-content/50">
          The provider the in-app agent uses. Switching provider resets the
          model selection.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Default model</span>
        <AiModelSelect
          provider={selectedProvider}
          value={model}
          onChange={setModel}
          disabled={saveMutation.isPending}
        />
        <EffectiveModelReadout
          effectiveProvider={selectedProvider}
          effectiveModel={settings.effective.model}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">API key</span>
        {providerStatus ? (
          <>
            <p className="text-xs">
              Environment variable: <span className="font-mono">{providerStatus.envApiKey}</span>
            </p>
            {providerStatus.configured ? (
              <p className="text-sm text-success">
                Configured server-side ({providerStatus.maskedApiKey})
              </p>
            ) : (
              <p className="text-sm text-warning">
                Not configured. The in-app agent cannot use this provider until
                the deployment provides {providerStatus.envApiKey}.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-warning">Unknown provider status.</p>
        )}
        <p className="text-xs text-base-content/50">
          Keys are managed by the deployment, never stored in OpenSEO.
          {!providerStatus?.configured && selectedProvider === "openrouter" && (
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

      {providerStatus && <CapabilityRow provider={providerStatus} />}

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Connection</span>
        <AiConnectionTest
          provider={selectedProvider}
          model={currentModel ?? ""}
          apiKeyConfigured={providerStatus?.configured ?? false}
        />      </div>

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