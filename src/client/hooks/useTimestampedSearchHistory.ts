import { z } from "zod";
import { useLocalHistoryStore } from "@/client/hooks/useLocalHistoryStore";
import { jsonCodec } from "@/shared/json";

/**
 * Shared recent-searches hook: localStorage-backed list of items tagged with
 * `timestamp`, keyed by a per-project storage key. Each call site provides
 * the item body's Zod schema (timestamp is added automatically) and a dedupe
 * predicate that decides whether two searches are "the same".
 */

const timestampFieldSchema = z.object({ timestamp: z.number() });

export function useTimestampedSearchHistory<TBody extends object>(args: {
  storageKey: string;
  bodySchema: z.ZodType<TBody>;
  isSame: (existing: TBody, next: TBody) => boolean;
  maxItems?: number;
}) {
  type StoredItem = TBody & { timestamp: number };
  const codec = jsonCodec(
    z.array(z.intersection(args.bodySchema, timestampFieldSchema)),
  );

  const { history, isLoaded, addItem, removeItem } = useLocalHistoryStore<
    StoredItem,
    TBody
  >({
    storageKey: args.storageKey,
    maxItems: args.maxItems ?? 20,
    parse: (raw) => {
      const parsed = codec.safeParse(raw);
      return parsed.success ? parsed.data : null;
    },
    isSameItem: (existing, next) => args.isSame(existing, next),
    createItem: (input) => ({ ...input, timestamp: Date.now() }),
    getItemKey: (item) => item.timestamp,
  });

  return {
    history,
    isLoaded,
    addSearch: addItem,
    removeHistoryItem: removeItem,
  };
}
