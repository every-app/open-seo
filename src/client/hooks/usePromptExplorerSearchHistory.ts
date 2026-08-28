import { z } from "zod";
import { useTimestampedSearchHistory } from "@/client/hooks/useTimestampedSearchHistory";
import {
  encodeModelVersionPairs,
  promptExplorerModelSchema,
  promptExplorerModelVersionsSchema,
  webSearchCountryCodeSchema,
} from "@/types/schemas/ai-search";

const promptExplorerSearchBodySchema = z.object({
  prompt: z.string(),
  highlightBrand: z.string(),
  models: z.array(promptExplorerModelSchema),
  // Optional so history persisted before model selection existed still parses.
  modelVersions: promptExplorerModelVersionsSchema.optional(),
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
  const versionsKey = (body: PromptExplorerSearchBody) =>
    encodeModelVersionPairs(body.modelVersions)?.join(",") ?? "";
  return (
    a.prompt === b.prompt &&
    a.highlightBrand === b.highlightBrand &&
    a.webSearch === b.webSearch &&
    a.webSearchCountryCode === b.webSearchCountryCode &&
    sameModels(a.models, b.models) &&
    versionsKey(a) === versionsKey(b)
  );
}

export function usePromptExplorerSearchHistory(projectId: string) {
  return useTimestampedSearchHistory({
    storageKey: `prompt-explorer-search-history:${projectId}`,
    bodySchema: promptExplorerSearchBodySchema,
    isSame: isSameSearch,
  });
}
