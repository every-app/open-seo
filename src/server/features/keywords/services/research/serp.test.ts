import { describe, expect, it, vi } from "vitest";
import type { BillingCustomerContext } from "@/server/billing/subscription";

const mocks = vi.hoisted(() => ({
  createDataforseoClient: vi.fn(),
  getCached: vi.fn(),
  setCached: vi.fn(async () => {}),
}));

vi.mock("cloudflare:workers", () => ({ waitUntil: vi.fn() }));

vi.mock("@/server/lib/r2-cache", () => ({
  buildCacheKey: vi.fn(async () => "serp:analysis:key"),
  getCached: mocks.getCached,
  setCached: mocks.setCached,
}));

vi.mock("@/server/lib/dataforseo", () => ({
  SERP_ANALYSIS_DEPTH: 20,
  createDataforseoClient: mocks.createDataforseoClient,
}));

import { getSerpAnalysis } from "./serp";

const billingCustomer: BillingCustomerContext = {
  organizationId: "org_1",
  userId: "user_1",
  userEmail: "alice@example.com",
};

const input = {
  projectId: "proj_1",
  keyword: "seo tools",
  locationCode: 2840,
  languageCode: "en",
};

function cachedSnapshot(depth: number) {
  return {
    requestedKeyword: "seo tools",
    depth,
    items: [
      {
        rank: 1,
        title: "Cached",
        url: "https://cached.example",
        domain: "cached.example",
        description: "",
        etv: null,
        estimatedPaidTrafficCost: null,
        referringDomains: null,
        backlinks: null,
        isNew: false,
        rankChange: null,
      },
    ],
  };
}

function mockLiveSerp() {
  const live = vi.fn().mockResolvedValue([
    {
      type: "organic",
      rank_group: 1,
      title: "Live",
      url: "https://live.example",
      domain: "live.example",
    },
  ]);
  mocks.createDataforseoClient.mockReturnValue({ serp: { live } });
  return live;
}

describe("getSerpAnalysis cache depth", () => {
  it("keeps a good snapshot when the deeper crawl comes back empty", async () => {
    mocks.getCached.mockResolvedValue(cachedSnapshot(20));
    mocks.createDataforseoClient.mockReturnValue({
      serp: { live: vi.fn().mockResolvedValue([]) },
    });

    const result = await getSerpAnalysis(
      { ...input, depth: 100 },
      billingCustomer,
    );

    expect(result.items).toEqual([]);
    // Caching the empty deep result would answer every shallower request with
    // nothing until the entry expires.
    expect(mocks.setCached).not.toHaveBeenCalled();
  });

  it("serves a depth-100 snapshot for a depth-20 request", async () => {
    mocks.getCached.mockResolvedValue(cachedSnapshot(100));
    const live = mockLiveSerp();

    const result = await getSerpAnalysis(
      { ...input, depth: 20 },
      billingCustomer,
    );

    expect(live).not.toHaveBeenCalled();
    expect(result.depth).toBe(100);
    expect(result.items[0]?.title).toBe("Cached");
  });

  it("refetches live at depth 100 when only a depth-20 snapshot is cached", async () => {
    mocks.getCached.mockResolvedValue(cachedSnapshot(20));
    const live = mockLiveSerp();

    const result = await getSerpAnalysis(
      { ...input, depth: 100 },
      billingCustomer,
    );

    expect(live).toHaveBeenCalledWith(expect.objectContaining({ depth: 100 }));
    expect(result.items[0]?.title).toBe("Live");
    // The deeper snapshot replaces the shallow entry under the same key.
    expect(mocks.setCached).toHaveBeenCalledWith(
      "serp:analysis:key",
      expect.objectContaining({ depth: 100 }),
      expect.any(Number),
    );
  });
});
