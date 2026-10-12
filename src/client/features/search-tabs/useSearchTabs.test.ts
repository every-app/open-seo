import { describe, expect, it } from "vitest";
import { appendTabWithEviction, parseStoredState } from "./useSearchTabs";
import type { SearchTab } from "./types";

function persistedTab(input: unknown) {
  return {
    id: "tab-1",
    label: "example",
    createdAt: 1,
    viewedAt: null,
    input,
  };
}

function searchTab(index: number): SearchTab {
  return {
    id: `tab-${index}`,
    label: `example-${index}.com`,
    createdAt: index,
    viewedAt: null,
    input: {
      type: "backlinks",
      target: `example-${index}.com`,
      scope: "subdomains",
    },
  };
}

describe("appendTabWithEviction", () => {
  it("evicts the oldest tab at capacity", () => {
    const tabs = Array.from({ length: 20 }, (_, index) => searchTab(index));

    const next = appendTabWithEviction(tabs, searchTab(20));

    expect(next).toHaveLength(20);
    expect(next[0].id).toBe("tab-1");
    expect(next[19].id).toBe("tab-20");
  });
});

describe("parseStoredState", () => {
  it("migrates domain tabs stored before research scopes or locations", () => {
    const state = parseStoredState({
      activeTabId: "tab-1",
      tabs: [
        {
          ...persistedTab({
            type: "domain",
            domain: "a.com",
            subdomains: true,
          }),
          id: "tab-1",
        },
        {
          ...persistedTab({
            type: "domain",
            domain: "b.com",
            subdomains: false,
          }),
          id: "tab-2",
        },
        {
          ...persistedTab({
            type: "backlinks",
            target: "d.com/page",
            scope: "page",
          }),
          id: "tab-3",
        },
        {
          ...persistedTab({
            type: "domain",
            domain: "c.com",
            scope: "subfolder",
          }),
          id: "tab-4",
        },
      ],
    });

    expect(state.activeTabId).toBe("tab-1");
    expect(state.tabs.map((tab) => tab.input)).toEqual([
      {
        type: "domain",
        domain: "a.com",
        scope: "subdomains",
        locationCode: undefined,
      },
      {
        type: "domain",
        domain: "b.com",
        scope: "domain",
        locationCode: undefined,
      },
      { type: "backlinks", target: "d.com/page", scope: "exact_url" },
      {
        type: "domain",
        domain: "c.com",
        scope: "subfolder",
        locationCode: undefined,
      },
    ]);
  });

  it("keeps keyword tabs persisted without a locationCode (default location)", () => {
    const state = parseStoredState({
      activeTabId: "tab-1",
      tabs: [
        persistedTab({
          type: "keyword",
          keyword: "seo tools",
          resultLimit: 150,
          mode: "auto",
          clickstream: false,
        }),
      ],
    });

    expect(state.tabs).toHaveLength(1);
    expect(state.activeTabId).toBe("tab-1");
    expect(state.tabs[0].input).toEqual({
      type: "keyword",
      keyword: "seo tools",
      locationCode: undefined,
      resultLimit: 150,
      mode: "auto",
      clickstream: false,
      groupKeywords: false,
    });
  });

  it("keeps the grouping each keyword tab was searched with", () => {
    const state = parseStoredState({
      activeTabId: "tab-1",
      tabs: [
        persistedTab({
          type: "keyword",
          keyword: "seo tools",
          resultLimit: 150,
          mode: "auto",
          clickstream: false,
          groupKeywords: true,
        }),
      ],
    });

    expect(state.tabs[0].input).toMatchObject({ groupKeywords: true });
  });

  it("restores prompt tabs and drops ones naming a model that no longer exists", () => {
    const prompt = {
      type: "prompt",
      prompt: "What's the best free password manager?",
      highlightBrand: "Bitwarden",
      models: ["chat_gpt", "claude"],
      webSearch: true,
      webSearchCountryCode: "default",
    };
    const state = parseStoredState({
      activeTabId: "tab-1",
      tabs: [
        persistedTab(prompt),
        persistedTab({ ...prompt, models: ["bard"] }),
      ],
    });

    expect(state.tabs.map((tab) => tab.input)).toEqual([prompt]);
  });

  it("keeps the newest tabs when stored state exceeds the limit", () => {
    const state = parseStoredState({
      activeTabId: null,
      tabs: Array.from({ length: 25 }, (_, index) => ({
        ...persistedTab({
          type: "backlinks",
          target: `example-${index}.com`,
          scope: "subdomains",
        }),
        id: `tab-${index}`,
      })),
    });

    expect(state.tabs).toHaveLength(20);
    expect(state.tabs[0].id).toBe("tab-5");
    expect(state.tabs[19].id).toBe("tab-24");
  });

  it("still rejects malformed tab inputs", () => {
    const state = parseStoredState({
      activeTabId: null,
      tabs: [
        persistedTab({ type: "domain", scope: "domain" }),
        persistedTab({
          type: "keyword",
          keyword: "seo tools",
          resultLimit: 999,
          mode: "auto",
        }),
        persistedTab({
          type: "domain",
          domain: "example.com",
          scope: "domain",
          locationCode: "us",
        }),
        persistedTab({ type: "unknown" }),
      ],
    });

    expect(state.tabs).toHaveLength(0);
  });
});
