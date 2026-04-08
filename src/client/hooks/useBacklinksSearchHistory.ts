import { z } from "zod";
import { useLocalHistoryStore } from "@/client/hooks/useLocalHistoryStore";
import { jsonCodec } from "@/shared/json";

export interface BacklinksSearchHistoryItem {
  target: string;
  scope: "domain" | "page";
  timestamp: number;
}

type AddBacklinksSearchInput = Omit<BacklinksSearchHistoryItem, "timestamp">;

const MAX_HISTORY = 20;

const backlinksSearchHistoryItemSchema = z.object({
  target: z.string(),
  scope: z.enum(["domain", "page"]),
  timestamp: z.number(),
});

const backlinksSearchHistorySchema = z.array(backlinksSearchHistoryItemSchema);
const backlinksSearchHistoryCodec = jsonCodec(backlinksSearchHistorySchema);

function isSameSearch(
  a: BacklinksSearchHistoryItem,
  b: AddBacklinksSearchInput,
): boolean {
  return a.target === b.target && a.scope === b.scope;
}

export function useBacklinksSearchHistory(projectId: string) {
  const { history, isLoaded, addItem, removeItem } = useLocalHistoryStore<
    BacklinksSearchHistoryItem,
    AddBacklinksSearchInput
  >({
    storageKey: `backlinks-search-history:${projectId}`,
    maxItems: MAX_HISTORY,
    parse: (raw) => {
      const parsed = backlinksSearchHistoryCodec.safeParse(raw);
      return parsed.success ? parsed.data : null;
    },
    isSameItem: isSameSearch,
    createItem: (item) => ({
      ...item,
      timestamp: Date.now(),
    }),
    getItemKey: (item) => item.timestamp,
  });

  return {
    history,
    isLoaded,
    addSearch: addItem,
    removeHistoryItem: removeItem,
  };
}
