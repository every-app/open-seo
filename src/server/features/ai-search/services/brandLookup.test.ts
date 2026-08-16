import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ waitUntil: vi.fn() }));

const { dataforseoClientMock, cacheMock, budgetMock, createClientMock } =
  vi.hoisted(() => ({
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
    budgetMock: {
      assertDataforseoBudgetAvailable: vi.fn(async () => undefined),
    },
    createClientMock: vi.fn(),
  }));

vi.mock("@/server/lib/dataforseo", () => {
  return {
    CHATGPT_LANGUAGE_CODE: "en",
    CHATGPT_LOCATION_CODE: 2840,
    buildLlmTarget: vi.fn(
      ({ type, value }: { type: "domain" | "keyword"; value: string }) =>
        type === "domain" ? { domain: value } : { keyword: value },
    ),
    createDataforseoClient: createClientMock,
  };
});

vi.mock("@/server/lib/r2-cache", () => cacheMock);
vi.mock("@/server/lib/seo-data/cost-tracker", () => budgetMock);
// Real single-flight implementation — the coalescing tests exercise it.
vi.mock("@/server/lib/seo-data/single-flight", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return actual;
});

import { clearSingleFlight } from "@/server/lib/seo-data/single-flight";
import { BudgetExceededError } from "@/server/lib/seo-data/errors";

import { getBrandLookup } from "./brandLookup";
import { shapeResult, type ShapeArgs } from "./brandLookupShaping";
import { resolveCompetitorGroups } from "./shareOfVoice";
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

type PlatformBundle = {
  aggregated: { platform?: Array<Record<string, unknown>> | null };
  topPages: LlmTopPagesItem[];
  mentions: LlmMentionItem[];
  complete: boolean;
};

function platformBundle(
  platform: "chat_gpt" | "google",
  mentions: number | null,
  aiSearchVolume: number | null,
): ShapeArgs["platformBundles"][number] {
  return {
    platform,
    status: "success",
    bundle: {
      aggregated: {
        platform: [
          {
            key: platform,
            mentions,
            ai_search_volume: aiSearchVolume,
            // Deprecated field still present in upstream payloads; must be
            // ignored end-to-end.
            impressions: 999,
          },
        ],
      },
      topPages: [],
      mentions: [],
      complete: true,
    } as PlatformBundle,
  };
}

function baseArgs(overrides: Partial<ShapeArgs>): ShapeArgs {
  return {
    query: "acme",
    detected: { type: "keyword", value: "acme" },
    platformBundles: [
      platformBundle("chat_gpt", 10, 100),
      platformBundle("google", 5, 50),
    ],
    crossOutcomes: [],
    competitorKeys: [],
    userLocationCode: 2840,
    userLanguageCode: "en",
    ...overrides,
  };
}

function resetBrandLookupMocks(): void {
  vi.clearAllMocks();
  createClientMock.mockReturnValue(dataforseoClientMock);
  budgetMock.assertDataforseoBudgetAvailable.mockResolvedValue(undefined);
  cacheMock.getCached.mockResolvedValue(null);
  cacheMock.setCached.mockResolvedValue(undefined);
  clearSingleFlight();
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
      citedMention("best source", 100, [`https://${platform}.example/source`]),
    ],
  );
  dataforseoClientMock.aiSearch.crossAggregatedMetrics.mockResolvedValue([]);
}

describe("getBrandLookup", () => {
  it("fetches top_pages as part of the base lookup", async () => {
    resetBrandLookupMocks();

    await getBrandLookup(
      {
        projectId: "project_123",
        query: "acme.com",
        competitors: [],
        locationCode: 2840,
        languageCode: "en",
      },
      billingCustomer,
    );

    expect(dataforseoClientMock.aiSearch.topPages).toHaveBeenCalledTimes(2);
    expect(dataforseoClientMock.aiSearch.topPages).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: "chat_gpt",
        itemsListLimit: 10,
      }),
    );
    expect(dataforseoClientMock.aiSearch.topPages).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: "google",
        itemsListLimit: 10,
      }),
    );
    expect(cacheMock.setCached).toHaveBeenCalledTimes(1);
  });

  it("does not cache a renderable partial result when top_pages fails", async () => {
    resetBrandLookupMocks();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    dataforseoClientMock.aiSearch.topPages.mockRejectedValueOnce(
      new Error("top pages failed"),
    );

    const result = await getBrandLookup(
      {
        projectId: "project_123",
        query: "acme.com",
        competitors: [],
        locationCode: 2840,
        languageCode: "en",
      },
      billingCustomer,
    );

    expect(result.hasData).toBe(true);
    expect(cacheMock.setCached).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("uses semantic cache keys and reapplies the current display query", async () => {
    resetBrandLookupMocks();
    cacheMock.getCached.mockResolvedValueOnce({
      ...shapeResult(baseArgs({})),
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
});

describe("resolveCompetitorGroups", () => {
  it("dedupes case-insensitively and drops target collisions", () => {
    // DataForSEO matches keyword targets case-insensitively, so "Nike" and
    // "nike" would be two paid groups returning identical counts.
    const groups = resolveCompetitorGroups("Nike", [
      "nike",
      "Adidas",
      "ADIDAS",
      "puma.com",
      "www.PUMA.com",
    ]);
    expect(groups.map((g) => g.label)).toEqual(["Adidas", "puma.com"]);
  });
});

describe("brandLookupSearchSchema — `c` competitor param", () => {
  it("parses a raw comma-separated string from the URL", () => {
    expect(brandLookupSearchSchema.parse({ c: "nike, adidas" }).c).toEqual([
      "nike",
      "adidas",
    ]);
  });

  it("accepts an already-parsed array (TanStack re-validates its own output)", () => {
    // navigate() feeds the previous transformed output (a string[]) back through
    // validateSearch — this must not throw "expected string, received array".
    expect(brandLookupSearchSchema.parse({ c: ["nike", "adidas"] }).c).toEqual([
      "nike",
      "adidas",
    ]);
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

  it("leaves `c` undefined when absent", () => {
    expect(brandLookupSearchSchema.parse({}).c).toBeUndefined();
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

function brandLookupInput(overrides: {
  query?: string;
  competitors?: string[];
} = {}) {
  return {
    projectId: "project_123",
    query: overrides.query ?? "acme.com",
    competitors: overrides.competitors ?? [],
    locationCode: 2840,
    languageCode: "en",
  };
}

describe("getBrandLookup cost containment", () => {
  it("serves a cached result with zero DataForSEO calls", async () => {
    resetBrandLookupMocks();
    cacheMock.getCached.mockResolvedValueOnce({
      ...shapeResult(baseArgs({})),
      query: "acme.com",
      resolvedTarget: "acme",
    });

    const result = await getBrandLookup(brandLookupInput(), billingCustomer);

    expect(result.hasData).toBe(true);
    expect(createClientMock).not.toHaveBeenCalled();
    expect(
      dataforseoClientMock.aiSearch.aggregatedMetrics,
    ).not.toHaveBeenCalled();
    expect(budgetMock.assertDataforseoBudgetAvailable).not.toHaveBeenCalled();
  });

  it("coalesces identical concurrent cache misses into one fan-out", async () => {
    resetBrandLookupMocks();

    const [a, b, c] = await Promise.all([
      getBrandLookup(brandLookupInput(), billingCustomer),
      getBrandLookup(brandLookupInput(), billingCustomer),
      getBrandLookup(brandLookupInput(), billingCustomer),
    ]);

    // One fan-out: one client, one set of paid calls, one cache write.
    expect(createClientMock).toHaveBeenCalledTimes(1);
    expect(dataforseoClientMock.aiSearch.aggregatedMetrics).toHaveBeenCalledTimes(
      2,
    );
    expect(cacheMock.setCached).toHaveBeenCalledTimes(1);
    for (const result of [a, b, c]) {
      expect(result.hasData).toBe(true);
    }
  });

  it("does not coalesce lookups across organizations", async () => {
    resetBrandLookupMocks();
    const otherOrg: BillingCustomerContext = {
      organizationId: "org_456",
      userId: "user_456",
      userEmail: "bob@example.com",
    };

    await Promise.all([
      getBrandLookup(brandLookupInput(), billingCustomer),
      getBrandLookup(brandLookupInput(), otherOrg),
    ]);

    // Two independent fan-outs → two clients.
    expect(createClientMock).toHaveBeenCalledTimes(2);
  });

  it("does not coalesce lookups with different targets or competitors", async () => {
    resetBrandLookupMocks();

    await Promise.all([
      getBrandLookup(brandLookupInput({ query: "acme.com" }), billingCustomer),
      getBrandLookup(
        brandLookupInput({ query: "acme.com", competitors: ["globex.com"] }),
        billingCustomer,
      ),
      getBrandLookup(brandLookupInput({ query: "globex.com" }), billingCustomer),
    ]);

    expect(createClientMock).toHaveBeenCalledTimes(3);
  });

  it("fans out normally when the budget is available", async () => {
    resetBrandLookupMocks();

    await getBrandLookup(brandLookupInput(), billingCustomer);

    expect(budgetMock.assertDataforseoBudgetAvailable).toHaveBeenCalledTimes(1);
    expect(dataforseoClientMock.aiSearch.aggregatedMetrics).toHaveBeenCalledTimes(
      2,
    );
  });

  it("fails before any DataForSEO call when the budget is exhausted", async () => {
    resetBrandLookupMocks();
    budgetMock.assertDataforseoBudgetAvailable.mockRejectedValue(
      new BudgetExceededError("daily", 1, 1),
    );

    await expect(
      getBrandLookup(brandLookupInput(), billingCustomer),
    ).rejects.toThrow(BudgetExceededError);
    expect(createClientMock).not.toHaveBeenCalled();
    expect(
      dataforseoClientMock.aiSearch.aggregatedMetrics,
    ).not.toHaveBeenCalled();
    expect(cacheMock.setCached).not.toHaveBeenCalled();
  });

  it("performs the paid calls exactly once per fan-out (no duplicate cost recording)", async () => {
    // The metered client boundary records cost per DataForSEO call. Exactly one
    // client per fan-out means exactly one charge sequence per logical lookup.
    resetBrandLookupMocks();

    await Promise.all([
      getBrandLookup(
        brandLookupInput({ competitors: ["globex.com"] }),
        billingCustomer,
      ),
      getBrandLookup(
        brandLookupInput({ competitors: ["globex.com"] }),
        billingCustomer,
      ),
    ]);

    expect(createClientMock).toHaveBeenCalledTimes(1);
    expect(
      dataforseoClientMock.aiSearch.crossAggregatedMetrics,
    ).toHaveBeenCalledTimes(2);
  });
});

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
