import { useCallback, useEffect, useRef, useState } from "react";

type UseLocalHistoryStoreOptions<TItem, TAddInput> = {
  storageKey: string;
  maxItems?: number;
  parse: (raw: string) => TItem[] | null;
  isSameItem: (existing: TItem, next: TAddInput) => boolean;
  createItem: (input: TAddInput) => TItem;
  getItemKey: (item: TItem) => number;
};

function loadHistory<TItem>(
  storageKey: string,
  parse: (raw: string) => TItem[] | null,
  maxItems: number,
): TItem[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];

    const parsed = parse(raw);
    return parsed ? parsed.slice(0, maxItems) : [];
  } catch {
    return [];
  }
}

function saveHistory<TItem>(storageKey: string, items: TItem[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(items));
  } catch {
    // storage full or unavailable - silently ignore
  }
}

export function useLocalHistoryStore<TItem, TAddInput>({
  storageKey,
  maxItems = 20,
  parse,
  isSameItem,
  createItem,
  getItemKey,
}: UseLocalHistoryStoreOptions<TItem, TAddInput>) {
  const parseRef = useRef(parse);
  const [history, setHistory] = useState<TItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    parseRef.current = parse;
  }, [parse]);

  useEffect(() => {
    setHistory(loadHistory(storageKey, parseRef.current, maxItems));
    setIsLoaded(true);
  }, [maxItems, storageKey]);

  const addItem = useCallback(
    (input: TAddInput) => {
      setHistory((prev) => {
        const filtered = prev.filter(
          (existing) => !isSameItem(existing, input),
        );
        const next = [createItem(input), ...filtered].slice(0, maxItems);
        saveHistory(storageKey, next);
        return next;
      });
    },
    [createItem, isSameItem, maxItems, storageKey],
  );

  const removeItem = useCallback(
    (itemKey: number) => {
      setHistory((prev) => {
        const next = prev.filter((item) => getItemKey(item) !== itemKey);
        saveHistory(storageKey, next);
        return next;
      });
    },
    [getItemKey, storageKey],
  );

  const clearItems = useCallback(() => {
    setHistory([]);
    saveHistory(storageKey, []);
  }, [storageKey]);

  return { history, isLoaded, addItem, removeItem, clearItems };
}
