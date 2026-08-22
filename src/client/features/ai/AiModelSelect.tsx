import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listAiModels } from "@/serverFunctions/aiSettings";
import type { AiProviderId } from "@/server/features/ai/providers";
import { filterModels } from "@/client/features/ai/modelFilter";

// Model picker fed by the selected provider's cached catalog (see
// providers.ts). The catalog can be large (~300+ models on OpenRouter), so a
// text filter narrows the select; the currently selected model stays listed
// even when it doesn't match the filter (see modelFilter.ts). When the
// provider has no catalog (unconfigured key or catalog fetch failure) the
// picker degrades to a manual model-id input so the agent's model can still be
// pinned.

function formatPrice(usd: number | null): string {
  if (usd === null) return "—";
  return usd === 0 ? "free" : `$${usd}`;
}

export function AiModelSelect({
  provider,
  value,
  onChange,
  disabled,
}: {
  provider: AiProviderId;
  value: string | null;
  onChange: (model: string) => void;
  disabled?: boolean;
}) {
  const modelsQuery = useQuery({
    queryKey: ["aiModels", provider],
    queryFn: () => listAiModels({ data: { provider } }),
    staleTime: 12 * 60 * 60 * 1000,
  });
  const [filter, setFilter] = useState("");
  const models = modelsQuery.data ?? [];

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
    </div>
  );
}