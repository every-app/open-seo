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
      scope: "domain",
    },
  };
}

describe("appendTabWithEviction", () => {
  it("appends without evicting below the limit", () => {
    const tabs = Array.from({ length: 19 }, (_, index) => searchTab(index));

    const next = appendTabWithEviction(tabs, searchTab(19));

    expect(next).toHaveLength(20);
    expect(next[0].id).toBe("tab-0");
    expect(next[19].id).toBe("tab-19");
  });

  it("evicts the oldest tab at capacity", () => {
    const tabs = Array.from({ length: 20 }, (_, index) => searchTab(index));

    const next = appendTabWithEviction(tabs, searchTab(20));

    expect(next).toHaveLength(20);
    expect(next[0].id).toBe("tab-1");
    expect(next[19].id).toBe("tab-20");
  });

  it("appends to an empty list", () => {
    expect(appendTabWithEviction([], searchTab(0))).toHaveLength(1);
  });
});

describe("parseStoredState", () => {
  it("keeps domain tabs persisted without a locationCode (default location)", () => {
    const state = parseStoredState({
      activeTabId: "tab-1",
      tabs: [
        persistedTab({
          type: "domain",
          domain: "example.com",
          subdomains: true,
        }),
      ],
    });

    expect(state.tabs).toHaveLength(1);
    expect(state.activeTabId).toBe("tab-1");
    expect(state.tabs[0].input).toEqual({
      type: "domain",
      domain: "example.com",
      subdomains: true,
      locationCode: undefined,
    });
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
    });
  });

  it("keeps tabs persisted with an explicit locationCode", () => {
    const state = parseStoredState({
      activeTabId: "tab-1",
      tabs: [
        persistedTab({
          type: "domain",
          domain: "example.com",
          subdomains: false,
          locationCode: 2840,
        }),
      ],
    });

    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].input).toMatchObject({ locationCode: 2840 });
  });

  it("keeps the newest tabs when stored state exceeds the limit", () => {
    const state = parseStoredState({
      activeTabId: null,
      tabs: Array.from({ length: 25 }, (_, index) => ({
        ...persistedTab({
          type: "backlinks",
          target: `example-${index}.com`,
          scope: "domain",
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
        persistedTab({ type: "domain", subdomains: true }),
        persistedTab({
          type: "keyword",
          keyword: "seo tools",
          resultLimit: 999,
          mode: "auto",
        }),
        persistedTab({
          type: "domain",
          domain: "example.com",
          subdomains: true,
          locationCode: "us",
        }),
        persistedTab({ type: "unknown" }),
      ],
    });

    expect(state.tabs).toHaveLength(0);
  });
});
