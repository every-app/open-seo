import { identity, sortBy } from "remeda";
import { explorePrompt } from "@/serverFunctions/ai-search";
import type {
  PromptExplorerModel,
  WebSearchCountrySelection,
} from "@/types/schemas/ai-search";

/** One Prompt Explorer search, as the URL and its search tab hold it. */
export type PromptExplorerSearch = {
  prompt: string;
  highlightBrand: string;
  models: PromptExplorerModel[];
  webSearch: boolean;
  webSearchCountryCode: WebSearchCountrySelection;
};

// Answers are billed per model, so, like keyword research, a finished search
// stays cached for a day and switching back to its tab never asks again.
export const PROMPT_EXPLORER_STALE_TIME_MS = 24 * 60 * 60 * 1000;

export function buildPromptExplorerQueryKey(
  projectId: string,
  search: PromptExplorerSearch,
) {
  return [
    "prompt-explorer",
    projectId,
    search.prompt.trim(),
    sortBy(search.models, identity()).join(","),
    search.webSearch,
    search.webSearchCountryCode,
    search.highlightBrand.trim(),
  ];
}

export function promptExplorerQueryFn(
  projectId: string,
  search: PromptExplorerSearch,
) {
  return explorePrompt({
    data: {
      projectId,
      prompt: search.prompt.trim(),
      models: search.models,
      highlightBrand: search.highlightBrand.trim() || undefined,
      webSearch: search.webSearch,
      webSearchCountryCode:
        search.webSearchCountryCode === "default"
          ? undefined
          : search.webSearchCountryCode,
    },
  });
}
