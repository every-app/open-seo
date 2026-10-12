import { z } from "zod";
import { useLocalHistoryStore } from "@/client/hooks/useLocalHistoryStore";
import { jsonCodec } from "@/shared/json";

interface SearchHistoryItem {
  keyword: string;
  locationCode: number;
  /** Display label of the searched country, city, county, or region. */
  locationName: string;
  /** Canonical DataForSEO name when the search had local volume. */
  localLocationName?: string;
  timestamp: number;
}

const MAX_HISTORY = 20;

const searchHistoryItemSchema = z.object({
  keyword: z.string(),
  locationCode: z.number(),
  locationName: z.string(),
  localLocationName: z.string().optional(),
  timestamp: z.number(),
});

const searchHistorySchema = z.array(searchHistoryItemSchema);
const searchHistoryCodec = jsonCodec(searchHistorySchema);

export function useSearchHistory(projectId: string) {
  const { history, isLoaded, addItem, removeItem, clearItems } =
    useLocalHistoryStore<
      SearchHistoryItem,
      Omit<SearchHistoryItem, "timestamp">
    >({
      storageKey: `search-history:${projectId}`,
      maxItems: MAX_HISTORY,
      parse: (raw) => {
        const parsed = searchHistoryCodec.safeParse(raw);
        return parsed.success ? parsed.data : null;
      },
      isSameItem: (existing, next) =>
        existing.keyword === next.keyword &&
        existing.locationCode === next.locationCode &&
        existing.localLocationName === next.localLocationName,
      createItem: (item) => ({
        ...item,
        timestamp: Date.now(),
      }),
      getItemKey: (item) => item.timestamp,
    });

  return {
    history,
    isLoaded,
    addSearch: (
      keyword: string,
      locationCode: number,
      locationName: string,
      localLocationName: string | undefined,
    ) => addItem({ keyword, locationCode, locationName, localLocationName }),
    clearHistory: clearItems,
    removeHistoryItem: removeItem,
  };
}
