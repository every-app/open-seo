import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listAiModels } from "@/serverFunctions/aiSettings";

// Model picker fed by the provider's cached catalog (see providers.ts). The
// catalog can be large (~300+ models on OpenRouter), so a text filter narrows
// the select; the currently selected model stays listed even when it doesn't
// match the filter.

function formatPrice(usd: number | null): string {
  if (usd === null) return "—";
  return usd === 0 ? "free" : `$${usd}`;
}

export function AiModelSelect({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (model: string) => void;
  disabled?: boolean;
}) {
  const modelsQuery = useQuery({
    queryKey: ["aiModels"],
    queryFn: () => listAiModels(),
    staleTime: 12 * 60 * 60 * 1000,
  });
  const [filter, setFilter] = useState("");
  const data = modelsQuery.data;
  const models = data ?? [];

  const filtered = useMemo(() => {
    const list = data ?? [];
    const term = filter.trim().toLowerCase();
    const sorted = list.toSorted((a, b) => a.name.localeCompare(b.name));
    if (!term) return sorted;
    return sorted.filter(
      (model) =>
        model.id.toLowerCase().includes(term) ||
        model.name.toLowerCase().includes(term),
    );
  }, [data, filter]);

  const selectedModel = models.find((model) => model.id === value) ?? null;

  if (modelsQuery.isPending && models.length === 0) {
    return (
      <span className="text-sm text-base-content/50">
        Loading model catalog…
      </span>
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
          {models.length === 0
            ? "No models available"
            : "Select a model…"}
        </option>
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