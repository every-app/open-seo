import { z } from "zod";
import { useLocalHistoryStore } from "@/client/hooks/useLocalHistoryStore";
import { jsonCodec } from "@/shared/json";
import {
  researchScopeSchema,
  type ResearchScope,
} from "@/shared/researchScope";

export interface BacklinksSearchHistoryItem {
  target: string;
  scope: ResearchScope;
  timestamp: number;
  /** Marks items written with research-scope values (see the codec below). */
  scopeVersion: typeof SCOPE_VERSION;
}

type AddBacklinksSearchInput = Omit<
  BacklinksSearchHistoryItem,
  "timestamp" | "scopeVersion"
>;

const MAX_HISTORY = 20;
const SCOPE_VERSION = 2;

/**
 * Before research scopes, "domain" meant the hostname plus its subdomains and
 * "page" meant one URL. Both names survive with different meanings, so only
 * items lacking `scopeVersion` get translated — a new "domain" pick must not
 * be re-read as "subdomains".
 */
const LEGACY_SCOPES: Record<string, ResearchScope> = {
  domain: "subdomains",
  page: "exact_url",
};

const backlinksSearchHistoryItemSchema = z
  .object({
    target: z.string(),
    scope: z.string(),
    scopeVersion: z.literal(SCOPE_VERSION).optional(),
    timestamp: z.number(),
  })
  .transform((item, ctx) => {
    const scope = researchScopeSchema.safeParse(
      item.scopeVersion === SCOPE_VERSION
        ? item.scope
        : LEGACY_SCOPES[item.scope],
    );
    if (!scope.success) {
      ctx.addIssue({ code: "custom", message: "Unknown backlinks scope" });
      return z.NEVER;
    }

    return {
      target: item.target,
      scope: scope.data,
      timestamp: item.timestamp,
      scopeVersion: SCOPE_VERSION,
    } satisfies BacklinksSearchHistoryItem;
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
      scopeVersion: SCOPE_VERSION,
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
