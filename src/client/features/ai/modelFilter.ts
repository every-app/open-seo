import type { AiModel } from "@/server/features/ai/providers";
import type { AiProviderId } from "@/server/features/ai/providerIds";

// Pure, unit-testable model-catalog filter used by AiModelSelect. Kept free of
// any module side effects so it can be tested without the client/server graph.

const PROVIDER_LABELS: Record<AiProviderId, string> = {
  openrouter: "OpenRouter",
  openai: "OpenAI",
  gemini: "Google Gemini",
  anthropic: "Anthropic",
  openai_compatible: "OpenAI Compatible",
  ollama_cloud: "Ollama Cloud",
};

/**
 * Client-side catalog filter for the model picker: case-insensitive match on
 * model id, display name, or provider display name. The currently selected
 * model id is always kept in the result (appended at the end) so the select
 * never drops the saved value while the user types.
 */
export function filterModels(
  models: AiModel[],
  filter: string,
  keepModelId: string | null,
): AiModel[] {
  const term = filter.trim().toLowerCase();
  const sorted = models.toSorted((a, b) => {
    const left = a.name.toLowerCase();
    const right = b.name.toLowerCase();
    if (left < right) return -1;
    if (left > right) return 1;
    return a.id.localeCompare(b.id);
  });
  const filtered = term
    ? sorted.filter(
        (model) =>
          model.id.toLowerCase().includes(term) ||
          model.name.toLowerCase().includes(term) ||
          (PROVIDER_LABELS[model.provider] ?? "").toLowerCase().includes(term),
      )
    : sorted;
  if (keepModelId && !filtered.some((model) => model.id === keepModelId)) {
    const saved = models.find((model) => model.id === keepModelId);
    if (saved) filtered.push(saved);
  }
  return filtered;
}