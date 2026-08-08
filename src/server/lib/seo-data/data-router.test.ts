import { describe, it, expect, beforeEach, vi } from "vitest";
import { DataRouter } from "./data-router";
import {
  ProviderUnavailableError,
  ProviderUnsupportedError,
  BudgetExceededError,
} from "./errors";
import {
  resetCostCounters,
  resetBudgetConfigCache,
} from "./cost-tracker";
import { resetProviderConfigCache } from "./config";
import { clearSingleFlight } from "./single-flight";
import type { SEODataProvider, SEODataRequest } from "./types";

// Use vi.hoisted so the mock fns are available inside the hoisted vi.mock factory.
const mocks = vi.hoisted(() => ({
  getCached: vi.fn<(key: string) => Promise<unknown>>(async () => null),
  setCached: vi.fn<
    (key: string, data: unknown, ttl: number) => Promise<void>
  >(async () => {}),
}));

vi.mock("@/server/lib/r2-cache", () => ({
  buildCacheKey: vi.fn(
    async (prefix: string, params: Record<string, unknown>) =>
      `${prefix}:${JSON.stringify(params)}`,
  ),
  getCached: (key: string) => mocks.getCached(key),
  setCached: (key: string, data: unknown, ttl: number) =>
    mocks.setCached(key, data, ttl),
  CACHE_TTL: { researchResult: 86400 },
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));

function makeProvider(
  name: string,
  supported: boolean,
  result: unknown,
  opts?: { throws?: unknown },
): SEODataProvider {
  return {
    name,
    supports: () => supported,
    get: async () => {
      if (opts?.throws) throw opts.throws;
      return result;
    },
  };
}

function makeRequest(
  overrides: Partial<SEODataRequest> = {},
): SEODataRequest {
  return {
    dataType: "serp",
    keyword: "test",
    locationCode: 2840,
    languageCode: "en",
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test-only BillingCustomerContext mock
    billingCustomer: { organizationId: "org-1" } as never,
    ...overrides,
  };
}

describe("DataRouter", () => {
  let router: DataRouter;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCached.mockResolvedValue(null);
    resetCostCounters();
    resetBudgetConfigCache();
    resetProviderConfigCache();
    clearSingleFlight();
    router = new DataRouter();
  });

  it("returns cached data on cache hit without calling any provider", async () => {
    mocks.getCached.mockResolvedValue({ items: ["cached"] });
    const provider = makeProvider("dataforseo", true, {
      items: ["fresh"],
    });
    router.register(provider);

    const res = await router.route(makeRequest());

    expect(res.fromCache).toBe(true);
    expect(res.data).toEqual({ items: ["cached"] });
  });

  it("calls the free provider first and caches the result", async () => {
    const free = makeProvider("internal", true, { items: ["internal"] });
    const dfs = makeProvider("dataforseo", true, { items: ["dfs"] });
    router.register(free);
    router.register(dfs);

    const res = await router.route(makeRequest());

    expect(res.fromCache).toBe(false);
    expect(res.data).toEqual({ items: ["internal"] });
    expect(mocks.setCached).toHaveBeenCalledTimes(1);
  });

  it("falls back to DataForSEO when free provider is unsupported", async () => {
    const free = makeProvider("internal", false, null);
    const dfs = makeProvider("dataforseo", true, { items: ["dfs"] });
    router.register(free);
    router.register(dfs);

    const res = await router.route(makeRequest());

    expect(res.data).toEqual({ items: ["dfs"] });
  });

  it("falls back to DataForSEO when free provider throws ProviderUnavailableError", async () => {
    const free = makeProvider("internal", true, null, {
      throws: new ProviderUnavailableError("internal", "no data"),
    });
    const dfs = makeProvider("dataforseo", true, { items: ["dfs"] });
    router.register(free);
    router.register(dfs);

    const res = await router.route(makeRequest());

    expect(res.data).toEqual({ items: ["dfs"] });
  });

  it("skips unsupported providers silently (ProviderUnsupportedError)", async () => {
    const free = makeProvider("internal", true, null, {
      throws: new ProviderUnsupportedError("internal", "serp"),
    });
    const dfs = makeProvider("dataforseo", true, { items: ["dfs"] });
    router.register(free);
    router.register(dfs);

    const res = await router.route(makeRequest());

    expect(res.data).toEqual({ items: ["dfs"] });
  });

  it("throws BudgetExceededError and does NOT call DataForSEO when budget is exceeded", async () => {
    router.register({
      name: "dataforseo",
      supports: () => true,
      get: async () => {
        throw new BudgetExceededError("daily", 0, 0);
      },
    });

    await expect(router.route(makeRequest())).rejects.toThrow(
      BudgetExceededError,
    );
  });

  it("throws when no provider is available", async () => {
    router.register(makeProvider("dataforseo", false, null));
    await expect(router.route(makeRequest())).rejects.toThrow();
  });

  it("coalesces concurrent identical requests via single-flight", async () => {
    const dfsGet = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 30));
      return { items: ["dfs"] };
    });
    router.register({
      name: "dataforseo",
      supports: () => true,
      get: dfsGet,
    });

    const req = makeRequest();
    const [res1, res2, res3] = await Promise.all([
      router.route(req),
      router.route(req),
      router.route(req),
    ]);

    // All three should get the same data
    expect(res1.data).toEqual({ items: ["dfs"] });
    expect(res2.data).toEqual({ items: ["dfs"] });
    expect(res3.data).toEqual({ items: ["dfs"] });
    // The provider should only be called once (single-flight coalescing)
    expect(dfsGet).toHaveBeenCalledTimes(1);
  });
});