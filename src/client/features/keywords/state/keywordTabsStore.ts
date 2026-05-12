import type {
  KeywordMode,
  ResultLimit,
} from "@/client/features/keywords/keywordResearchTypes";

export type KeywordTab = {
  id: string;
  keyword: string;
  locationCode: number;
  resultLimit: ResultLimit;
  mode: KeywordMode;
  createdAt: number;
  viewedAt: number | null;
};

export type ProjectTabsState = {
  tabs: KeywordTab[];
  activeTabId: string | null;
};

export type OpenTabInput = {
  keyword: string;
  locationCode: number;
  resultLimit: ResultLimit;
  mode: KeywordMode;
};

type OpenTabsResult = {
  opened: KeywordTab[];
  focused: KeywordTab[];
  activeTab: KeywordTab | null;
  dropped: OpenTabInput[];
};

export const KEYWORD_TABS_LIMIT = 8;
export const EMPTY_TABS_STATE: ProjectTabsState = {
  tabs: [],
  activeTabId: null,
};

const STORAGE_KEY_PREFIX = "keyword-tabs:";
const CHANGE_EVENT = "keyword-tabs-change";

// Module-level cache. Returning stable references keeps useSyncExternalStore
// from infinite-looping on Object.is equality checks.
const projectStates = new Map<string, ProjectTabsState>();

function storageKey(projectId: string): string {
  return `${STORAGE_KEY_PREFIX}${projectId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isResultLimit(value: unknown): value is ResultLimit {
  return value === 150 || value === 300 || value === 500;
}

function isKeywordMode(value: unknown): value is KeywordMode {
  return (
    value === "auto" ||
    value === "related" ||
    value === "suggestions" ||
    value === "ideas"
  );
}

function parseTab(value: unknown): KeywordTab | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || value.id === "") return null;
  if (typeof value.keyword !== "string" || value.keyword === "") return null;
  if (typeof value.locationCode !== "number") return null;
  if (!isResultLimit(value.resultLimit)) return null;
  if (!isKeywordMode(value.mode)) return null;
  if (typeof value.createdAt !== "number") return null;
  const viewedAt =
    value.viewedAt === null
      ? null
      : typeof value.viewedAt === "number"
        ? value.viewedAt
        : null;
  return {
    id: value.id,
    keyword: value.keyword,
    locationCode: value.locationCode,
    resultLimit: value.resultLimit,
    mode: value.mode,
    createdAt: value.createdAt,
    viewedAt,
  };
}

function parseStoredState(value: unknown): ProjectTabsState {
  if (!isRecord(value)) return EMPTY_TABS_STATE;
  if (!Array.isArray(value.tabs)) return EMPTY_TABS_STATE;
  const tabs: KeywordTab[] = [];
  for (const raw of value.tabs) {
    const parsed = parseTab(raw);
    if (parsed) tabs.push(parsed);
  }
  const activeTabId =
    typeof value.activeTabId === "string" &&
    tabs.some((tab) => tab.id === value.activeTabId)
      ? value.activeTabId
      : null;
  return { tabs, activeTabId };
}

function loadFromStorage(projectId: string): ProjectTabsState {
  if (typeof window === "undefined") return EMPTY_TABS_STATE;
  try {
    const raw = window.sessionStorage.getItem(storageKey(projectId));
    if (!raw) return EMPTY_TABS_STATE;
    const parsed: unknown = JSON.parse(raw);
    return parseStoredState(parsed);
  } catch {
    return EMPTY_TABS_STATE;
  }
}

function persist(projectId: string, state: ProjectTabsState) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey(projectId), JSON.stringify(state));
  } catch {
    // sessionStorage unavailable or full; in-memory cache still works.
  }
}

function notify() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function getKeywordTabsSnapshot(projectId: string): ProjectTabsState {
  let state = projectStates.get(projectId);
  if (!state) {
    state = loadFromStorage(projectId);
    projectStates.set(projectId, state);
  }
  return state;
}

export function subscribeKeywordTabsStore(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

function update(
  projectId: string,
  updater: (current: ProjectTabsState) => ProjectTabsState,
) {
  const current = getKeywordTabsSnapshot(projectId);
  const next = updater(current);
  if (next === current) return;
  projectStates.set(projectId, next);
  persist(projectId, next);
  notify();
}

function generateTabId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function tabMatches(tab: KeywordTab, input: OpenTabInput): boolean {
  return (
    tab.keyword === input.keyword &&
    tab.locationCode === input.locationCode &&
    tab.resultLimit === input.resultLimit &&
    tab.mode === input.mode
  );
}

export function findMatchingTab(
  state: ProjectTabsState,
  input: OpenTabInput,
): KeywordTab | null {
  return state.tabs.find((tab) => tabMatches(tab, input)) ?? null;
}

export function openTabs(
  projectId: string,
  inputs: OpenTabInput[],
): OpenTabsResult {
  const opened: KeywordTab[] = [];
  const focused: KeywordTab[] = [];
  const dropped: OpenTabInput[] = [];
  let resultActiveTab: KeywordTab | null = null;

  update(projectId, (current) => {
    let tabs = current.tabs;
    let activeTabId = current.activeTabId;

    for (const input of inputs) {
      const existing = tabs.find((tab) => tabMatches(tab, input));
      if (existing) {
        focused.push(existing);
        activeTabId = existing.id;
        resultActiveTab = existing;
        continue;
      }

      if (tabs.length >= KEYWORD_TABS_LIMIT) {
        dropped.push(input);
        continue;
      }

      const next: KeywordTab = {
        id: generateTabId(),
        keyword: input.keyword,
        locationCode: input.locationCode,
        resultLimit: input.resultLimit,
        mode: input.mode,
        createdAt: Date.now(),
        viewedAt: null,
      };
      tabs = [...tabs, next];
      opened.push(next);
      activeTabId = next.id;
      resultActiveTab = next;
    }

    if (tabs === current.tabs && activeTabId === current.activeTabId) {
      return current;
    }
    return { tabs, activeTabId };
  });

  return { opened, focused, activeTab: resultActiveTab, dropped };
}

export function setActiveTab(projectId: string, tabId: string | null) {
  update(projectId, (current) => {
    if (current.activeTabId === tabId) return current;
    if (tabId !== null && !current.tabs.some((tab) => tab.id === tabId)) {
      return current;
    }
    return { ...current, activeTabId: tabId };
  });
}

export function closeTab(
  projectId: string,
  tabId: string,
): { nextActiveTab: KeywordTab | null; closedActive: boolean } {
  let nextActiveTab: KeywordTab | null = null;
  let closedActive = false;

  update(projectId, (current) => {
    const index = current.tabs.findIndex((tab) => tab.id === tabId);
    if (index === -1) return current;

    const tabs = current.tabs.filter((tab) => tab.id !== tabId);
    let activeTabId = current.activeTabId;

    if (current.activeTabId === tabId) {
      closedActive = true;
      // Activate the right neighbor, fall back to the left, fall back to null.
      const neighbor = tabs[index] ?? tabs[index - 1] ?? null;
      activeTabId = neighbor?.id ?? null;
      nextActiveTab = neighbor;
    }

    return { tabs, activeTabId };
  });

  return { nextActiveTab, closedActive };
}

export function markTabViewed(
  projectId: string,
  tabId: string,
  when = Date.now(),
) {
  update(projectId, (current) => {
    let changed = false;
    const tabs = current.tabs.map((tab) => {
      if (tab.id !== tabId) return tab;
      if (tab.viewedAt !== null && tab.viewedAt >= when) return tab;
      changed = true;
      return { ...tab, viewedAt: when };
    });
    if (!changed) return current;
    return { ...current, tabs };
  });
}
