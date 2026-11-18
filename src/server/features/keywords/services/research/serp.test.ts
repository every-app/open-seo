import { describe, expect, it, vi } from "vitest";
import type { BillingCustomerContext } from "@/server/billing/subscription";

const mocks = vi.hoisted(() => ({
  assertLocalResearchLocation: vi.fn(async () => {}),
  buildCacheKey: vi.fn(async () => "serp:analysis:key"),
  readMergedSerps:
    vi.fn<
      (
        billing: unknown,
        requests: Array<{ query: Record<string, unknown> }>,
      ) => Promise<unknown>
    >(),
  getCached: vi.fn(),
  setCached: vi.fn(async () => {}),
}));

vi.mock("cloudflare:workers", () => ({ waitUntil: vi.fn() }));

vi.mock("@/server/lib/r2-cache", () => ({
  buildCacheKey: mocks.buildCacheKey,
  getCached: mocks.getCached,
  setCached: mocks.setCached,
}));

vi.mock("./local-volume", () => ({
  assertLocalResearchLocation: mocks.assertLocalResearchLocation,
}));

vi.mock("./serpReads", () => ({
  readMergedSerps: mocks.readMergedSerps,
}));

vi.mock("@/server/lib/dataforseo", () => ({
  SERP_ANALYSIS_DEPTH: 10,
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

function mockMergedSerp() {
  mocks.readMergedSerps.mockResolvedValue([
    {
      status: "completed",
      items: [
        {
          type: "organic",
          rank_group: 4,
          seenIn: 3,
          title: "Agreed",
          url: "https://agreed.example",
          domain: "agreed.example",
        },
        {
          type: "organic",
          rank_group: 1,
          seenIn: 1,
          title: "One read",
          url: "https://one-read.example",
          domain: "one-read.example",
        },
        { type: "people_also_ask", rank_absolute: 3, seenIn: 2 },
      ],
    },
  ]);
}

describe("getSerpAnalysis cache depth", () => {
  it("keeps a good snapshot when the deeper crawl comes back empty", async () => {
    mocks.getCached.mockResolvedValue(cachedSnapshot(10));
    mocks.readMergedSerps.mockResolvedValue([
      { status: "completed", items: [] },
    ]);

    const result = await getSerpAnalysis(
      { ...input, depth: 100 },
      billingCustomer,
    );

    expect(result.items).toEqual([]);
    // Caching the empty deep result would answer every shallower request with
    // nothing until the entry expires.
    expect(mocks.setCached).not.toHaveBeenCalled();
  });

  it("serves a depth-100 snapshot for a depth-10 request", async () => {
    mocks.getCached.mockResolvedValue(cachedSnapshot(100));

    const result = await getSerpAnalysis(
      { ...input, depth: 10 },
      billingCustomer,
    );

    expect(mocks.readMergedSerps).not.toHaveBeenCalled();
    expect(result.depth).toBe(100);
    expect(result.items[0]?.title).toBe("Cached");
  });

  it("refetches at depth 100 when only a page 1 snapshot is cached", async () => {
    mocks.getCached.mockResolvedValue(cachedSnapshot(10));
    mockMergedSerp();

    const result = await getSerpAnalysis(
      { ...input, depth: 100 },
      billingCustomer,
    );

    expect(mocks.readMergedSerps.mock.lastCall?.[1][0].query).toMatchObject({
      depth: 100,
    });
    // Numbered in merged order, organic rows only: the panel doesn't surface
    // the separate reads.
    expect(result.items.map(({ rank, title }) => [rank, title])).toEqual([
      [1, "Agreed"],
      [2, "One read"],
    ]);
    // The deeper snapshot replaces the shallow entry under the same key.
    expect(mocks.setCached).toHaveBeenCalledWith(
      "serp:analysis:key",
      expect.objectContaining({ depth: 100 }),
      expect.any(Number),
    );
  });

  it("fetches and caches the SERP for the selected area", async () => {
    mocks.getCached.mockResolvedValue(null);
    mockMergedSerp();
    const locationName = "Austin,Texas,United States";

    await getSerpAnalysis(
      { ...input, depth: 10, locationName },
      billingCustomer,
    );

    expect(mocks.assertLocalResearchLocation).toHaveBeenCalledWith(
      2840,
      locationName,
    );
    expect(mocks.readMergedSerps.mock.lastCall?.[1][0].query).toMatchObject({
      locationName,
    });
    // A national snapshot must never answer a local request.
    expect(mocks.buildCacheKey).toHaveBeenCalledWith(
      "serp:analysis",
      expect.objectContaining({ locationName }),
    );
  });

  it("says to retry, and caches nothing, while the reads are still running", async () => {
    mocks.getCached.mockResolvedValue(null);
    mocks.readMergedSerps.mockResolvedValue([{ status: "processing" }]);

    await expect(
      getSerpAnalysis({ ...input, depth: 10 }, billingCustomer),
    ).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });

    expect(mocks.setCached).not.toHaveBeenCalled();
  });
});
