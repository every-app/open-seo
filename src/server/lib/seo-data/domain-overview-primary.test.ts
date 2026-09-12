import { beforeEach, describe, expect, it, vi } from "vitest";
import { DataRouter } from "./data-router";
import { createInternalProvider } from "./providers/internal-provider";
import { AppError } from "@/server/lib/errors";
import {
  BudgetExceededError,
  ProviderUnavailableError,
  ProviderUnsupportedError,
} from "./errors";
import {
  resetCostCounters,
  resetBudgetConfigCache,
} from "./cost-tracker";
import { resetProviderConfigCache } from "./config";
import { clearSingleFlight } from "./single-flight";
import {
  getSamTraceBus,
  resetSamTraceBus,
} from "@/server/features/sam/samTraceBus";
import type { SEODataProvider, SEODataRequest } from "./types";

// Focused policy tests (get_domain_overview primary-source change):
// DataForSEO must be the PRIMARY external source when no fresh cache exists;
// internal snapshots serve only as the failure fallback. Fresh R2 cache still
// avoids the paid call. All other data types keep free-first ordering.

const mocks = vi.hoisted(() => ({
  getCached: vi.fn<(key: string) => Promise<unknown>>(async () => null),
  setCached: vi.fn<
    (key: string, data: unknown, ttl: number) => Promise<void>
  >(async () => {}),
  db: { select: vi.fn(), insert: vi.fn() },
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

vi.mock("@/db", () => ({ db: mocks.db }));
vi.mock("cloudflare:workers", () => ({ env: {} }));

function makeProvider(
  name: string,
  supported: boolean,
  get: () => Promise<unknown>,
): SEODataProvider {
  return {
    name,
    supports: () => supported,
    get,
  };
}

function overviewRequest(): SEODataRequest {
  return {
    dataType: "domain_overview",
    domain: "powersiment.ae",
    locationCode: 2840,
    languageCode: "en",
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test-only BillingCustomerContext mock
    billingCustomer: { organizationId: "org-1" } as never,
    constraints: { projectId: "project-1" },
  };
}

const DFS_METRICS = [{ metrics: { organic: { etv: 1234.5, count: 57.2 } } }];
const INTERNAL_METRICS = [{ metrics: { organic: { etv: 900, count: 40 } } }];

describe("get_domain_overview — DataForSEO primary policy", () => {
  let router: DataRouter;
  let dfsGet: ReturnType<typeof vi.fn>;
  let internalGet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCached.mockResolvedValue(null);
    resetCostCounters();
    resetBudgetConfigCache();
    resetProviderConfigCache();
    clearSingleFlight();
    router = new DataRouter();
    dfsGet = vi.fn(async () => DFS_METRICS);
    internalGet = vi.fn(async () => INTERNAL_METRICS);
    router.register(makeProvider("dataforseo", true, dfsGet));
    router.register(makeProvider("internal", true, internalGet));
  });

  it("1. fresh cache: zero provider calls", async () => {
    mocks.getCached.mockResolvedValue(DFS_METRICS);
    const res = await router.route(overviewRequest());
    expect(res.fromCache).toBe(true);
    expect(res.data).toEqual(DFS_METRICS);
    expect(dfsGet).not.toHaveBeenCalled();
    expect(internalGet).not.toHaveBeenCalled();
  });

  it("2. no cache + DataForSEO success: DataForSEO result, no internal call, cached", async () => {
    const res = await router.route(overviewRequest());
    expect(res.fromCache).toBe(false);
    expect(res.data).toEqual(DFS_METRICS);
    expect(dfsGet).toHaveBeenCalledTimes(1);
    expect(internalGet).not.toHaveBeenCalled();
    expect(mocks.setCached).toHaveBeenCalledTimes(1);
  });

  it("3. DataForSEO 402 (PAYMENT_REQUIRED): one DFS call, internal fallback, no DFS-cache write for fallback-only run when internal also fails surfaces 402", async () => {
    dfsGet.mockRejectedValue(
      Object.assign(new AppError("PAYMENT_REQUIRED", "credits"), {
        statusCode: 402,
      }),
    );
    // Internal has data → fallback serves the request.
    const res = await router.route(overviewRequest());
    expect(dfsGet).toHaveBeenCalledTimes(1);
    expect(internalGet).toHaveBeenCalledTimes(1);
    expect(res.data).toEqual(INTERNAL_METRICS);
  });

  it("3b. DataForSEO 402 with NO internal data: the 402 error survives the walk (recovery sees it)", async () => {
    dfsGet.mockRejectedValue(
      Object.assign(new AppError("PAYMENT_REQUIRED", "credits"), {
        statusCode: 402,
      }),
    );
    internalGet.mockRejectedValue(
      new ProviderUnsupportedError("internal", "domain_overview", "no snapshot"),
    );
    await expect(router.route(overviewRequest())).rejects.toThrow(
      "credits",
    );
    expect(dfsGet).toHaveBeenCalledTimes(1);
  });

  it("4/5. DataForSEO 5xx-then-success across the guarded-runner retry: each walk calls DataForSEO first and returns the DFS result", async () => {
    // Walk 1 (handler attempt 1): DFS transient failure → internal (none) →
    // error surfaces → guarded runner schedules ONE retry.
    dfsGet.mockRejectedValueOnce(new Error("503 gateway failure"));
    internalGet.mockRejectedValue(
      new ProviderUnsupportedError("internal", "domain_overview", "no data"),
    );
    await expect(router.route(overviewRequest())).rejects.toThrow("503");
    // Walk 2 (automatic retry): DFS succeeds → authoritative result, and the
    // internal fallback never runs (no redundant internal call).
    const res = await router.route(overviewRequest());
    expect(res.data).toEqual(DFS_METRICS);
    expect(dfsGet).toHaveBeenCalledTimes(2);
    expect(internalGet).toHaveBeenCalledTimes(1);
  });

  it("6. DataForSEO fails, internal fallback serves: fallback data marked by provider order (DFS ×1, internal ×1)", async () => {
    dfsGet.mockRejectedValue(new Error("fetch failed ETIMEDOUT"));
    const res = await router.route(overviewRequest());
    expect(dfsGet).toHaveBeenCalledTimes(1);
    expect(internalGet).toHaveBeenCalledTimes(1);
    expect(res.data).toEqual(INTERNAL_METRICS);
  });

  it("7. DataForSEO disabled: zero paid calls, internal fallback", async () => {
    // Simulate the disabled flag: the provider itself throws
    // ProviderUnavailable (what createDataforseoProvider does when
    // DATAFORSEO_ENABLED=false).
    const dfsDisabledGet = vi.fn(async (): Promise<unknown> => {
      throw new ProviderUnavailableError(
        "dataforseo",
        "DataForSEO is disabled (DATAFORSEO_ENABLED=false)",
      );
    });
    const throwingDfs: SEODataProvider = {
      name: "dataforseo",
      supports: () => true,
      get: dfsDisabledGet,
    };
    const r2 = new DataRouter();
    r2.register(throwingDfs);
    r2.register(makeProvider("internal", true, internalGet));
    const res = await r2.route(overviewRequest());
    expect(dfsDisabledGet).toHaveBeenCalledTimes(1);
    expect(internalGet).toHaveBeenCalledTimes(1);
    expect(res.data).toEqual(INTERNAL_METRICS);
  });

  it("8. DataForSEO credentials unavailable: provider-unavailable behavior, fallback", async () => {
    const dfsAuthGet = vi.fn(async (): Promise<unknown> => {
      throw new AppError(
        "DATAFORSEO_AUTH_FAILED",
        "DataForSEO credentials are not configured",
      );
    });
    const authFailedDfs: SEODataProvider = {
      name: "dataforseo",
      supports: () => true,
      get: dfsAuthGet,
    };
    const r2 = new DataRouter();
    r2.register(authFailedDfs);
    r2.register(makeProvider("internal", true, internalGet));
    const res = await r2.route(overviewRequest());
    expect(dfsAuthGet).toHaveBeenCalledTimes(1);
    expect(internalGet).toHaveBeenCalledTimes(1);
    expect(res.data).toEqual(INTERNAL_METRICS);
  });

  it("9. fallback snapshot used ONLY after DataForSEO failure — never before", async () => {
    // Internal has data; DFS succeeds → internal must NOT run.
    dfsGet.mockResolvedValue(DFS_METRICS);
    await router.route(overviewRequest());
    expect(internalGet).not.toHaveBeenCalled();
    // Now DFS fails → internal serves.
    dfsGet.mockRejectedValue(new Error("503 gateway"));
    const res = await router.route(overviewRequest());
    expect(internalGet).toHaveBeenCalledTimes(1);
    expect(res.data).toEqual(INTERNAL_METRICS);
  });

  it("10. failed DataForSEO response is never cached as a successful snapshot", async () => {
    dfsGet.mockRejectedValue(new Error("fetch failed"));
    internalGet.mockRejectedValue(
      new ProviderUnsupportedError("internal", "domain_overview", "no data"),
    );
    await expect(router.route(overviewRequest())).rejects.toThrow("fetch failed");
    // The only cache write attempt happened for NO provider (all failed):
    expect(mocks.setCached).not.toHaveBeenCalled();
  });

  it("12. no redundant internal call after DataForSEO success", async () => {
    await router.route(overviewRequest());
    expect(dfsGet).toHaveBeenCalledTimes(1);
    expect(internalGet).toHaveBeenCalledTimes(0);
  });

  it("free-first for OTHER data types remains unchanged (serp: internal first)", async () => {
    const serpDfs = vi.fn(async () => ({ items: ["dfs"] }));
    const serpInternal = vi.fn(async () => ({ items: ["internal"] }));
    const r2 = new DataRouter();
    r2.register(makeProvider("internal", true, serpInternal));
    r2.register(makeProvider("dataforseo", true, serpDfs));
    const res = await r2.route({
      dataType: "serp",
      keyword: "test",
      locationCode: 2840,
      languageCode: "en",
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test-only BillingCustomerContext mock
      billingCustomer: { organizationId: "org-1" } as never,
    });
    expect(res.data).toEqual({ items: ["internal"] });
    expect(serpDfs).not.toHaveBeenCalled();
  });

  it("budget-exceeded on DataForSEO aborts the walk (no internal masking)", async () => {
    dfsGet.mockRejectedValue(new BudgetExceededError("daily", 0, 0));
    await expect(router.route(overviewRequest())).rejects.toThrow(
      BudgetExceededError,
    );
    expect(internalGet).not.toHaveBeenCalled();
  });
});

// 26. INTEGRATION — deterministic end-to-end through the REAL internal
// provider (the production one) with a mocked DataForSEO provider: no cache,
// DataForSEO 200 → Handler provider set is DataForSEO ×1, internal ×0.
describe("get_domain_overview — integration (real internal provider)", () => {
  it("26. no cache + DataForSEO 200: DataForSEO ×1, internal ×0, snapshot semantics preserved", async () => {
    vi.clearAllMocks();
    mocks.getCached.mockResolvedValue(null);
    resetCostCounters();
    resetBudgetConfigCache();
    resetProviderConfigCache();
    clearSingleFlight();

    const dfsGet = vi.fn(async () => DFS_METRICS);
    const router = new DataRouter();
    router.register({
      name: "dataforseo",
      supports: (r) => r.dataType === "domain_overview",
      get: dfsGet,
    });
    router.register(createInternalProvider());

    const res = await router.route(overviewRequest());

    expect(res.fromCache).toBe(false);
    expect(res.provider).toBe("provider");
    expect(res.data).toEqual(DFS_METRICS);
    expect(dfsGet).toHaveBeenCalledTimes(1);
    // The real internal provider never executed (no DB read happened).
    expect(mocks.db.select).not.toHaveBeenCalled();
    // Cache write happened exactly once (the DataForSEO result).
    expect(mocks.setCached).toHaveBeenCalledTimes(1);
  });

  it("26b. DataForSEO fails + real internal has a FRESH snapshot: fallback serves", async () => {
    vi.clearAllMocks();
    mocks.getCached.mockResolvedValue(null);
    resetCostCounters();
    resetBudgetConfigCache();
    resetProviderConfigCache();
    clearSingleFlight();

    const dfsGet = vi.fn(async () => {
      throw new Error("fetch failed ETIMEDOUT");
    });
    const router = new DataRouter();
    router.register({
      name: "dataforseo",
      supports: (r) => r.dataType === "domain_overview",
      get: dfsGet,
    });
    router.register(createInternalProvider());

    // Fresh internal snapshot row (fetchedAt = now → within the 7-day TTL).
    mocks.db.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 1,
                organizationId: "org-1",
                domain: "powersiment.ae",
                locationCode: 2840,
                languageCode: "en",
                organicTraffic: 900,
                organicKeywords: 40,
                fetchedAt: new Date().toISOString(),
              },
            ]),
          }),
        }),
      }),
    });

    const res = await router.route(overviewRequest());
    expect(dfsGet).toHaveBeenCalledTimes(1);
    expect(res.data).toEqual(INTERNAL_METRICS);
    // Fallback result is cached under the same key (existing semantics).
    expect(mocks.setCached).toHaveBeenCalledTimes(1);
  });
});

// §29 trace fidelity: a DataForSEO transient failure that propagates past the
// internal fallback must be attributed to dataforseo (the failing provider),
// never relabeled as an internal failure. The trace seam attaches the failing
// provider name to the error so the guarded runner's provider_error event
// blames the right source.
describe("get_domain_overview — failure attribution (§29)", () => {
  it("inside a turn, the surviving DataForSEO error carries providerErrorSource=dataforseo", async () => {
    vi.clearAllMocks();
    mocks.getCached.mockResolvedValue(null);
    resetCostCounters();
    resetBudgetConfigCache();
    resetProviderConfigCache();
    clearSingleFlight();

    // Real internal provider with NO snapshot → its ProviderUnsupportedError
    // is swallowed by the router; DataForSEO's error must survive.
    mocks.db.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    });

    const dfsError = new Error("fetch failed ETIMEDOUT");
    const dfsGet = vi.fn(async (): Promise<unknown> => {
      throw dfsError;
    });
    const router = new DataRouter();
    router.register({
      name: "dataforseo",
      supports: (r) => r.dataType === "domain_overview",
      get: dfsGet,
    });
    router.register(createInternalProvider());

    // Activate the SAM trace bus singleton with a turn — the seam that stamps
    // providerErrorSource only runs inside a live turn.
    resetSamTraceBus();
    const bus = getSamTraceBus();
    bus.startTurn();
    try {
      let caught: unknown;
      try {
        await router.route(overviewRequest());
      } catch (error) {
        caught = error;
      }
      expect(caught).toBe(dfsError);
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- duck-typed trace metadata on a caught error
      const marker = caught as { providerErrorSource?: unknown };
      expect(marker.providerErrorSource).toBe("dataforseo");
      // The trace events show DataForSEO attempted FIRST (primary policy).
      const events = bus.snapshot()?.events ?? [];
      const requests = events
        .filter((e) => e.event === "provider_request")
        .map((e) => e.provider);
      expect(requests[0]).toBe("dataforseo");
      expect(requests[1]).toBe("internal");
    } finally {
      resetSamTraceBus();
    }
  });
});
