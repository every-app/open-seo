import { useState, useEffect, useCallback } from "react";
import { z } from "zod";
import { jsonCodec } from "@/shared/json";

type DomainSortMode = "rank" | "traffic" | "volume";
type DomainTab = "keywords" | "pages";

export interface DomainSearchHistoryItem {
  domain: string;
  subdomains: boolean;
  sort: DomainSortMode;
  tab: DomainTab;
  search?: string;
  timestamp: number;
}

type AddDomainSearchInput = Omit<DomainSearchHistoryItem, "timestamp">;

const MAX_HISTORY = 20;

const domainSearchHistoryItemSchema = z.object({
  domain: z.string(),
  subdomains: z.boolean(),
  sort: z.enum(["rank", "traffic", "volume"]),
  tab: z.enum(["keywords", "pages"]),
  search: z.string().optional(),
  timestamp: z.number(),
});

const domainSearchHistorySchema = z.array(domainSearchHistoryItemSchema);
const domainSearchHistoryCodec = jsonCodec(domainSearchHistorySchema);

function storageKey(projectId: string) {
  return `domain-search-history:${projectId}`;
}

function loadHistory(projectId: string): DomainSearchHistoryItem[] {
  const raw = localStorage.getItem(storageKey(projectId));
  if (!raw) return [];

  const parsed = domainSearchHistoryCodec.safeParse(raw);
  return parsed.success ? parsed.data.slice(0, MAX_HISTORY) : [];
}

function saveHistory(projectId: string, items: DomainSearchHistoryItem[]) {
  try {
    localStorage.setItem(storageKey(projectId), JSON.stringify(items));
  } catch {
    // storage full or unavailable - silently ignore
  }
}

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
    normalizeSearchText(a.search) === normalizeSearchText(b.search)
  );
}

export function useDomainSearchHistory(projectId: string) {
  const [history, setHistory] = useState<DomainSearchHistoryItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setHistory(loadHistory(projectId));
    setIsLoaded(true);
  }, [projectId]);

  const addSearch = useCallback(
    (item: AddDomainSearchInput) => {
      setHistory((prev) => {
        const filtered = prev.filter(
          (existing) => !isSameSearch(existing, item),
        );
        const next = [
          {
            ...item,
            search: normalizeSearchText(item.search) || undefined,
            timestamp: Date.now(),
          },
          ...filtered,
        ].slice(0, MAX_HISTORY);
        saveHistory(projectId, next);
        return next;
      });
    },
    [projectId],
  );

  const removeHistoryItem = useCallback(
    (timestamp: number) => {
      setHistory((prev) => {
        const next = prev.filter((item) => item.timestamp !== timestamp);
        saveHistory(projectId, next);
        return next;
      });
    },
    [projectId],
  );

  const clearHistory = useCallback(() => {
    setHistory([]);
    saveHistory(projectId, []);
  }, [projectId]);

  return { history, isLoaded, addSearch, clearHistory, removeHistoryItem };
}
