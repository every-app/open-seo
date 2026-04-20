import { z } from "zod";
import { useLocalHistoryStore } from "@/client/hooks/useLocalHistoryStore";
import { jsonCodec } from "@/shared/json";

type DomainSortMode = "rank" | "traffic" | "volume" | "score" | "cpc";
type DomainTab = "keywords" | "pages";

export interface DomainSearchHistoryItem {
  domain: string;
  subdomains: boolean;
  sort: DomainSortMode;
  tab: DomainTab;
  search?: string;
  locationCode?: number;
  timestamp: number;
}

type AddDomainSearchInput = Omit<DomainSearchHistoryItem, "timestamp">;

const MAX_HISTORY = 20;

const domainSearchHistoryItemSchema = z.object({
  domain: z.string(),
  subdomains: z.boolean(),
  sort: z.enum(["rank", "traffic", "volume", "score", "cpc"]),
  tab: z.enum(["keywords", "pages"]),
  search: z.string().optional(),
  locationCode: z.number().int().positive().optional(),
  timestamp: z.number(),
});

const domainSearchHistorySchema = z.array(domainSearchHistoryItemSchema);
const domainSearchHistoryCodec = jsonCodec(domainSearchHistorySchema);

function normalizeSearchText(value: string | undefined): string {
  return value?.trim() ?? "";
}

function isSameSearch(
  a: DomainSearchHistoryItem,
  b: AddDomainSearchInput,
): boolean {
  return (
    a.domain === b.domain &&
    a.subdomains === b.subdomains &&
    a.sort === b.sort &&
    a.tab === b.tab &&
    a.locationCode === b.locationCode &&
    normalizeSearchText(a.search) === normalizeSearchText(b.search)
  );
}

export function useDomainSearchHistory(projectId: string) {
  const { history, isLoaded, addItem, removeItem, clearItems } =
    useLocalHistoryStore<DomainSearchHistoryItem, AddDomainSearchInput>({
      storageKey: `domain-search-history:${projectId}`,
      maxItems: MAX_HISTORY,
      parse: (raw) => {
        const parsed = domainSearchHistoryCodec.safeParse(raw);
        return parsed.success ? parsed.data : null;
      },
      isSameItem: isSameSearch,
      createItem: (item) => ({
        ...item,
        search: normalizeSearchText(item.search) || undefined,
        timestamp: Date.now(),
      }),
      getItemKey: (item) => item.timestamp,
    });

  return {
    history,
    isLoaded,
    addSearch: addItem,
    clearHistory: clearItems,
    removeHistoryItem: removeItem,
  };
}
