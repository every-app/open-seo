import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  db: { select: vi.fn(), insert: vi.fn() },
}));

vi.mock("@/db", () => ({ db: mocks.db }));

vi.mock("cloudflare:workers", () => ({ env: {} }));

import {
  canonicalKeywordKey,
  getLatestCompetitorSnapshot,
  persistCompetitorSnapshot,
} from "./competitor-snapshot-repository";

function fakeSelectChain(rows: unknown[]) {
  mocks.db.select.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(rows),
        }),
      }),
    }),
  });
}

describe("canonicalKeywordKey", () => {
  it("lowercases, dedupes, and sorts the keyword set", () => {
    expect(canonicalKeywordKey(["CRM", "sales", "crm", "b2b"])).toBe(
      '["b2b","crm","sales"]',
    );
  });

  it("is order-independent", () => {
    expect(canonicalKeywordKey(["a", "b"])).toBe(
      canonicalKeywordKey(["b", "a"]),
    );
  });
});

describe("persistCompetitorSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts a row with the canonical keyword key and JSON items", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    mocks.db.insert.mockReturnValue({ values });

    await persistCompetitorSnapshot({
      projectId: "project-1",
      keywords: ["CRM", "sales"],
      locationCode: 2840,
      languageCode: "en",
      items: [{ domain: "hubspot.com" }],
    });

    expect(mocks.db.insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith({
      projectId: "project-1",
      keywordKey: '["crm","sales"]',
      keywordsJson: '["CRM","sales"]',
      locationCode: 2840,
      languageCode: "en",
      itemsJson: '[{"domain":"hubspot.com"}]',
    });
  });
});

describe("getLatestCompetitorSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the parsed items of the latest matching row", async () => {
    fakeSelectChain([{ itemsJson: '[{"domain":"hubspot.com","etv":100}]' }]);

    const items = await getLatestCompetitorSnapshot({
      projectId: "project-1",
      keywords: ["sales", "crm"],
      locationCode: 2840,
      languageCode: "en",
    });

    expect(items).toEqual([{ domain: "hubspot.com", etv: 100 }]);
  });

  it("returns null when no row matches", async () => {
    fakeSelectChain([]);

    const items = await getLatestCompetitorSnapshot({
      projectId: "project-1",
      keywords: ["crm"],
      locationCode: 2840,
      languageCode: "en",
    });

    expect(items).toBeNull();
  });

  it("returns null on malformed items JSON", async () => {
    fakeSelectChain([{ itemsJson: "{not json" }]);

    const items = await getLatestCompetitorSnapshot({
      projectId: "project-1",
      keywords: ["crm"],
      locationCode: 2840,
      languageCode: "en",
    });

    expect(items).toBeNull();
  });
});
