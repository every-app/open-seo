import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { listAiModels } from "@/serverFunctions/aiSettings";
import type { AiProviderId } from "@/server/features/ai/providerIds";
import { filterModels } from "@/client/features/ai/modelFilter";
import { traceAiModelCatalog } from "@/client/features/tracing/settingsTrace";

// Model picker fed by the selected provider's catalog (see providers.ts),
// resolved through the EFFECTIVE configuration (stored credentials / Base
// URL overrides / unsaved edits passed down by the scope settings). The
// catalog can be large (~300+ models on OpenRouter), so a text filter
// narrows the select; the currently selected model stays listed even when it
// doesn't match the filter (see modelFilter.ts). When no catalog is
// available the picker degrades to a manual model-id input.
//
// `refreshSignal` bumps trigger a cache-BYPASSING refetch (Refresh Models,
// S16); `lastRefreshedAt` renders the "Updated just now" feedback.

function formatPrice(usd: number | null): string {
  if (usd === null) return "—";
  return usd === 0 ? "free" : `$${usd}`;
}

export function AiModelSelect({
  provider,
  value,
  onChange,
  disabled,
  baseUrl,
  apiKey,
  refreshSignal,
  projectId,
  onRefreshed,
}: {
  provider: AiProviderId;
  value: string | null;
  onChange: (model: string) => void;
  disabled?: boolean;
  /** Unsaved Base URL edit (endpoint providers) — scopes discovery. */
  baseUrl?: string;
  /** Unsaved API key edit — round-trips over TLS, never stored or logged. */
  apiKey?: string;
  /** Bump to force a cache-bypassing catalog fetch. */
  refreshSignal?: number;
  projectId?: string;
  /** Called after a successful refresh so the UI can show "Updated just now". */
  onRefreshed?: () => void;
}) {
  const queryClient = useQueryClient();
  const traceScope = projectId ? "project" : "organization";
  const traceSource = projectId ? "Project settings" : "Settings";
  const modelsQuery = useQuery({
    queryKey: [
      "aiModels",
      provider,
      baseUrl ?? null,
      apiKey ? "with-key" : null,
      projectId ?? null,
    ],
    queryFn: () =>
      traceAiModelCatalog({
        source: traceSource,
        projectId: projectId || undefined,
        scope: traceScope,
        provider,
        refresh: refreshSignal !== undefined && refreshSignal > 0,
        call: () =>
          listAiModels({
            data: {
              provider,
              baseUrl: baseUrl || undefined,
              apiKey: apiKey || undefined,
              refresh: refreshSignal !== undefined && refreshSignal > 0,
              projectId: projectId || undefined,
            },
          }),
      }),
    staleTime: 12 * 60 * 60 * 1000,
  });
  const [filter, setFilter] = useState("");
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const models = modelsQuery.data ?? [];

  // Refresh Models (S16): when the parent bumps the signal, refetch with
  // refresh:true (cache bypass) and surface feedback.
  useEffect(() => {
    if (refreshSignal === undefined || refreshSignal <= 0) return;
    void queryClient
      .fetchQuery({
        queryKey: ["aiModels", provider, "refresh", refreshSignal],
        queryFn: () =>
          traceAiModelCatalog({
            source: traceSource,
            projectId: projectId || undefined,
            scope: traceScope,
            provider,
            refresh: true,
            call: () =>
              listAiModels({
                data: {
                  provider,
                  baseUrl: baseUrl || undefined,
                  apiKey: apiKey || undefined,
                  refresh: true,
                  projectId: projectId || undefined,
                },
              }),
          }),
      })
      .then(() => {
        void queryClient.invalidateQueries({
          queryKey: ["aiModels", provider],
        });
        const now = new Date();
        const minutes = now.getMinutes();
        setRefreshedAt(
          `Updated just now (${String(minutes).padStart(2, "0")}:${String(
            now.getSeconds(),
          ).padStart(2, "0")})`,
        );
        onRefreshed?.();
      })
      .catch(() => {
        // Refresh failure keeps the current catalog; the error surfaces via
        // the connection test / provider error messaging.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- signal-driven
  }, [refreshSignal]);

  const filtered = useMemo(
    () => filterModels(modelsQuery.data ?? [], filter, value),
    [modelsQuery.data, filter, value],
  );

  const selectedModel = models.find((model) => model.id === value) ?? null;

  if (modelsQuery.isPending && models.length === 0) {
    return (
      <span className="text-sm text-base-content/50">
        Loading model catalog…
      </span>
    );
  }

  if (models.length === 0) {
    return (
      <div className="space-y-1.5">
        <input
          type="text"
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Model id (e.g. gpt-5)"
          disabled={disabled}
          className="input input-bordered input-sm w-full font-mono"
          aria-label="AI model id"
        />
        <p className="text-xs text-base-content/50">
          No catalog available for this provider — enter a model id manually.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input
        type="search"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Filter models…"
        disabled={disabled}
        className="input input-bordered input-sm w-full"
        aria-label="Filter AI models"
      />
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled || models.length === 0}
        className="select select-bordered select-sm w-full"
      >
        <option value="" disabled>
          Select a model…
        </option>
        {value && !selectedModel && (
          <option value={value}>{value} (saved model)</option>
        )}
        {filtered.map((model) => (
          <option key={model.id} value={model.id}>
            {model.name} — {formatPrice(model.promptPrice)} prompt /{" "}
            {formatPrice(model.completionPrice)} completion
            {model.contextLength ? ` · ${model.contextLength.toLocaleString()} ctx` : ""}
          </option>
        ))}
      </select>
      {selectedModel && (
        <p className="text-xs text-base-content/50">
          {selectedModel.supportsTools
            ? "Supports tool calling."
            : "No tool-calling support listed — the agent may not be able to use its tools."}
        </p>
      )}
      {refreshedAt && (
        <p className="text-xs text-success">{refreshedAt}</p>
      )}
    </div>
  );
}