import { describe, expect, it } from "vitest";
import { parseStoredState } from "./useSearchTabs";

function persistedTab(input: unknown) {
  return {
    id: "tab-1",
    label: "example",
    createdAt: 1,
    viewedAt: null,
    input,
  };
}

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
