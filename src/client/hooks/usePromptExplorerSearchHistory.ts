import { z } from "zod";
import { useTimestampedSearchHistory } from "@/client/hooks/useTimestampedSearchHistory";
import {
  promptExplorerModelSchema,
  webSearchCountryCodeSchema,
} from "@/types/schemas/ai-search";

const promptExplorerSearchBodySchema = z.object({
  prompt: z.string(),
  highlightBrand: z.string(),
  models: z.array(promptExplorerModelSchema),
  webSearch: z.boolean(),
  webSearchCountryCode: webSearchCountryCodeSchema,
});

type PromptExplorerSearchBody = z.infer<typeof promptExplorerSearchBodySchema>;

export type PromptExplorerSearchHistoryItem = PromptExplorerSearchBody & {
  timestamp: number;
};

function sameModels(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = a.toSorted();
  const sortedB = b.toSorted();
  return sortedA.every((model, index) => model === sortedB[index]);
}

function isSameSearch(
  a: PromptExplorerSearchBody,
  b: PromptExplorerSearchBody,
): boolean {
  return (
    a.prompt === b.prompt &&
    a.highlightBrand === b.highlightBrand &&
    a.webSearch === b.webSearch &&
    a.webSearchCountryCode === b.webSearchCountryCode &&
    sameModels(a.models, b.models)
  );
}

export function usePromptExplorerSearchHistory(projectId: string) {
  return useTimestampedSearchHistory({
    storageKey: `prompt-explorer-search-history:${projectId}`,
    bodySchema: promptExplorerSearchBodySchema,
    isSame: isSameSearch,
  });
}
