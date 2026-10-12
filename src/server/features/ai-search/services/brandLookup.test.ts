import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ waitUntil: vi.fn() }));

const { dataforseoClientMock, cacheMock } = vi.hoisted(() => ({
  dataforseoClientMock: {
    aiSearch: {
      aggregatedMetrics: vi.fn(),
      topPages: vi.fn(),
      mentionsSearch: vi.fn(),
      crossAggregatedMetrics: vi.fn(),
    },
  },
  cacheMock: {
    buildCacheKey: vi.fn(async (_prefix: string, params: unknown) =>
      JSON.stringify(params),
    ),
    getCached: vi.fn(),
    setCached: vi.fn(async () => undefined),
  },
}));

vi.mock("@/server/lib/dataforseo", () => {
  return {
    CHATGPT_LANGUAGE_CODE: "en",
    CHATGPT_LOCATION_CODE: 2840,
    buildLlmTarget: vi.fn(
      ({
        type,
        value,
        includeSubdomains,
      }: {
        type: "domain" | "keyword";
        value: string;
        includeSubdomains?: boolean;
      }) =>
        type === "domain"
          ? { domain: value, include_subdomains: includeSubdomains ?? true }
          : { keyword: value },
    ),
    createDataforseoClient: vi.fn(() => dataforseoClientMock),
  };
});

vi.mock("@/server/lib/r2-cache", () => cacheMock);

import { getBrandLookup } from "./brandLookup";
import { shapeResult } from "./brandLookupShaping";
import { brandLookupSearchSchema } from "@/types/schemas/ai-search";
import type {
  LlmMentionItem,
  LlmTopPagesItem,
} from "@/server/lib/dataforseoLlmSchemas";
import type { BillingCustomerContext } from "@/server/billing/subscription";

const billingCustomer: BillingCustomerContext = {
  organizationId: "org_123",
  userId: "user_123",
  userEmail: "alice@example.com",
};

// A previously cached result for the same target, built through the real
// shaper so it passes the cache schema on read.
const cachedResult = shapeResult({
  query: "acme",
  detected: { type: "keyword", value: "acme" },
  researchTarget: null,
  platformBundles: [],
  crossOutcomes: [],
  competitorKeys: [],
  userLocationCode: 2840,
  userLanguageCode: "en",
});

describe("getBrandLookup", () => {
  beforeEach(() => {
    cacheMock.getCached.mockResolvedValue(null);
    cacheMock.setCached.mockResolvedValue(undefined);
    dataforseoClientMock.aiSearch.aggregatedMetrics.mockResolvedValue({
      platform: [{ key: "google", mentions: 5, ai_search_volume: 50 }],
    });
    dataforseoClientMock.aiSearch.topPages.mockImplementation(
      async ({ platform }: { platform: "chat_gpt" | "google" }) => [
        topPage(`https://${platform}.example/source`, platform, 3, 300),
      ],
    );
    dataforseoClientMock.aiSearch.mentionsSearch.mockImplementation(
      async ({ platform }: { platform: "chat_gpt" | "google" }) => [
        citedMention("best source", 100, [
          `https://${platform}.example/source`,
        ]),
      ],
    );
    dataforseoClientMock.aiSearch.crossAggregatedMetrics.mockResolvedValue([]);
  });

  it("does not cache a renderable partial result when top_pages fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const input = {
      projectId: "project_123",
      query: "acme.com",
      competitors: [],
      locationCode: 2840,
      languageCode: "en",
    };
    dataforseoClientMock.aiSearch.topPages.mockRejectedValueOnce(
      new Error("top pages failed"),
    );

    const partial = await getBrandLookup(input, billingCustomer);
    expect(partial.hasData).toBe(true);
    expect(cacheMock.setCached).not.toHaveBeenCalled();

    // Positive control: the same lookup with every call succeeding is cached.
    await getBrandLookup(input, billingCustomer);
    expect(cacheMock.setCached).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  it("uses semantic cache keys and reapplies the current display query", async () => {
    cacheMock.getCached.mockResolvedValueOnce({
      ...cachedResult,
      query: "Nike",
      resolvedTarget: "Nike",
    });

    const result = await getBrandLookup(
      {
        projectId: "project_123",
        query: "nike",
        competitors: ["ADIDAS"],
        locationCode: 2840,
        languageCode: "en",
      },
      billingCustomer,
    );

    expect(result.query).toBe("nike");
    expect(cacheMock.buildCacheKey).toHaveBeenCalledWith(
      "ai-search:brand-lookup",
      expect.objectContaining({
        targetValue: "nike",
        competitors: "adidas",
      }),
    );
    expect(
      dataforseoClientMock.aiSearch.aggregatedMetrics,
    ).not.toHaveBeenCalled();
  });

  it("drops subdomains and keys the cache on scope for a URL query", async () => {
    const result = await getBrandLookup(
      {
        projectId: "project_123",
        query: "https://acme.com/blog",
        competitors: [],
        locationCode: 2840,
        languageCode: "en",
      },
      billingCustomer,
    );

    // No URL-level targeting exists upstream: the call is domain-only with
    // subdomains excluded, and page rows are filtered in shaping.
    expect(
      dataforseoClientMock.aiSearch.aggregatedMetrics,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { domain: "acme.com", include_subdomains: false },
      }),
    );
    expect(cacheMock.buildCacheKey).toHaveBeenCalledWith(
      "ai-search:brand-lookup",
      expect.objectContaining({ scope: "subfolder", path: "/blog" }),
    );
    expect(result.resolvedTarget).toBe("acme.com/blog");
    expect(result.aggregatesAreDomainLevel).toBe(true);
  });
});

describe("brandLookupSearchSchema — `c` competitor param", () => {
  it.each([
    ["a raw comma-separated string from the URL", "nike, adidas"],
    // navigate() feeds the previous transformed output (a string[]) back
    // through validateSearch — this must not throw "expected string".
    [
      "an already-parsed array (TanStack re-validates its own output)",
      ["nike", "adidas"],
    ],
  ])("parses %s", (_form, c) => {
    expect(brandLookupSearchSchema.parse({ c }).c).toEqual(["nike", "adidas"]);
  });

  it("dedupes and caps at 5 regardless of input form", () => {
    const many = ["a", "a", "b", "c", "d", "e", "f"];
    expect(brandLookupSearchSchema.parse({ c: many }).c).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
  });
});

function citedMention(
  question: string,
  aiSearchVolume: number | null,
  urls: string[],
): LlmMentionItem {
  return {
    question,
    ai_search_volume: aiSearchVolume,
    sources: urls.map((url) => ({ url })),
  };
}

function topPage(
  url: string,
  platform: "chat_gpt" | "google",
  mentions: number | null,
  aiSearchVolume: number | null,
): LlmTopPagesItem {
  return {
    key: url,
    platform: [{ key: platform, mentions, ai_search_volume: aiSearchVolume }],
  };
}
