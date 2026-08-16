import { describe, it, expect, beforeEach, vi } from "vitest";
import { SeoCacheService } from "./cache-service";
import { resetProviderConfigCache } from "./config";
import type { SEODataRequest } from "./types";
import { z } from "zod";

// Mock R2 cache primitives — the cache service delegates to these.
const mockGetCached = vi.fn<(key: string) => Promise<unknown>>(
  async () => null,
);
const mockSetCached = vi.fn<
  (key: string, data: unknown, ttl: number) => Promise<void>
>(async () => {});

vi.mock("@/server/lib/r2-cache", () => ({
  buildCacheKey: vi.fn(
    async (prefix: string, params: Record<string, unknown>) => {
      const raw = JSON.stringify(
        Object.entries(params).toSorted(([a], [b]) => a.localeCompare(b)),
      );
      return `${prefix}:${raw}`;
    },
  ),
  getCached: (key: string) => mockGetCached(key),
  setCached: (key: string, data: unknown, ttl: number) =>
    mockSetCached(key, data, ttl),
  CACHE_TTL: { researchResult: 86400 },
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));

const baseRequest: SEODataRequest = {
  dataType: "serp",
  keyword: "test keyword",
  locationCode: 2840,
  languageCode: "en",
  device: "desktop",
  billingCustomer:
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test-only BillingCustomerContext mock
    { organizationId: "org-1" } as never,
};

const testSchema = z.object({ items: z.array(z.string()) });

describe("SeoCacheService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetProviderConfigCache();
  });

  describe("buildKey", () => {
    it("includes data type and organization in the key", async () => {
      const key = await SeoCacheService.buildKey(baseRequest);
      expect(key).toContain("seo:serp");
      expect(key).toContain("org-1");
    });

    it("produces different keys for different locations", async () => {
      const reqA = { ...baseRequest, locationCode: 2840 };
      const reqB = { ...baseRequest, locationCode: 2826 };
      const keyA = await SeoCacheService.buildKey(reqA);
      const keyB = await SeoCacheService.buildKey(reqB);
      expect(keyA).not.toBe(keyB);
    });

    it("produces different keys for different devices", async () => {
      const reqA = { ...baseRequest, device: "desktop" as const };
      const reqB = { ...baseRequest, device: "mobile" as const };
      const keyA = await SeoCacheService.buildKey(reqA);
      const keyB = await SeoCacheService.buildKey(reqB);
      expect(keyA).not.toBe(keyB);
    });

    it("produces different keys for different keywords", async () => {
      const reqA = { ...baseRequest, keyword: "alpha" };
      const reqB = { ...baseRequest, keyword: "beta" };
      const keyA = await SeoCacheService.buildKey(reqA);
      const keyB = await SeoCacheService.buildKey(reqB);
      expect(keyA).not.toBe(keyB);
    });

    it("produces the same key for identical requests", async () => {
      const keyA = await SeoCacheService.buildKey(baseRequest);
      const keyB = await SeoCacheService.buildKey(baseRequest);
      expect(keyA).toBe(keyB);
    });

    it("shares domain overview keys across projects in one organization", async () => {
      const reqA: SEODataRequest = {
        ...baseRequest,
        dataType: "domain_overview",
        keyword: undefined,
        domain: "example.com",
        constraints: { projectId: "project-a" },
      };
      const reqB = {
        ...reqA,
        constraints: { projectId: "project-b" },
      };

      expect(await SeoCacheService.buildKey(reqA)).toBe(
        await SeoCacheService.buildKey(reqB),
      );
    });

    it("keeps domain overview cache keys isolated by organization", async () => {
      const reqA: SEODataRequest = {
        ...baseRequest,
        dataType: "domain_overview",
        keyword: undefined,
        domain: "example.com",
        constraints: { projectId: "project-a" },
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test-only BillingCustomerContext mock
        billingCustomer: { organizationId: "org-a" } as never,
      };
      const reqB = {
        ...reqA,
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test-only BillingCustomerContext mock
        billingCustomer: { organizationId: "org-b" } as never,
      };

      expect(await SeoCacheService.buildKey(reqA)).not.toBe(
        await SeoCacheService.buildKey(reqB),
      );
    });

    it("retains project-scoped constraints for other data types", async () => {
      const reqA = {
        ...baseRequest,
        constraints: { projectId: "project-a" },
      };
      const reqB = {
        ...reqA,
        constraints: { projectId: "project-b" },
      };

      expect(await SeoCacheService.buildKey(reqA)).not.toBe(
        await SeoCacheService.buildKey(reqB),
      );
    });

    it("shares backlink summary keys across projects in one organization", async () => {
      const reqA: SEODataRequest = {
        ...baseRequest,
        dataType: "backlinks",
        keyword: undefined,
        domain: "example.com",
        constraints: { projectId: "project-a", backlinkCall: "summary" },
      };
      const reqB = {
        ...reqA,
        constraints: { backlinkCall: "summary" },
      };
      const reqC = {
        ...reqA,
        constraints: { projectId: "project-c", backlinkCall: "summary" },
      };

      const keyA = await SeoCacheService.buildKey(reqA);
      expect(keyA).toBe(await SeoCacheService.buildKey(reqB));
      expect(keyA).toBe(await SeoCacheService.buildKey(reqC));
    });

    it("keeps backlink summary cache keys isolated by organization", async () => {
      const reqA: SEODataRequest = {
        ...baseRequest,
        dataType: "backlinks",
        keyword: undefined,
        domain: "example.com",
        constraints: { projectId: "project-a", backlinkCall: "summary" },
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test-only BillingCustomerContext mock
        billingCustomer: { organizationId: "org-a" } as never,
      };
      const reqB = {
        ...reqA,
        constraints: { backlinkCall: "summary" },
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test-only BillingCustomerContext mock
        billingCustomer: { organizationId: "org-b" } as never,
      };

      expect(await SeoCacheService.buildKey(reqA)).not.toBe(
        await SeoCacheService.buildKey(reqB),
      );
    });

    it("keeps non-summary backlink operations project-sensitive in the key", async () => {
      const rowsA: SEODataRequest = {
        ...baseRequest,
        dataType: "backlinks",
        keyword: undefined,
        domain: "example.com",
        constraints: { projectId: "project-a", backlinkCall: "rows", limit: 50 },
      };
      const rowsB = {
        ...rowsA,
        constraints: { backlinkCall: "rows", limit: 50 },
      };
      const historyA: SEODataRequest = {
        ...baseRequest,
        dataType: "backlinks",
        keyword: undefined,
        domain: "example.com",
        dateFrom: "2026-01-01",
        dateTo: "2026-02-01",
        constraints: { projectId: "project-a", backlinkCall: "history" },
      };
      const historyB = {
        ...historyA,
        constraints: { backlinkCall: "history" },
      };

      expect(await SeoCacheService.buildKey(rowsA)).not.toBe(
        await SeoCacheService.buildKey(rowsB),
      );
      expect(await SeoCacheService.buildKey(historyA)).not.toBe(
        await SeoCacheService.buildKey(historyB),
      );
    });
  });

  describe("get", () => {
    it("returns cached data on hit with valid schema", async () => {
      mockGetCached.mockResolvedValue({ items: ["a", "b"] });
      const result = await SeoCacheService.get(baseRequest, testSchema);
      expect(result).not.toBeNull();
      expect(result?.data).toEqual({ items: ["a", "b"] });
    });

    it("returns null on cache miss", async () => {
      mockGetCached.mockResolvedValue(null);
      const result = await SeoCacheService.get(baseRequest, testSchema);
      expect(result).toBeNull();
    });

    it("returns null on schema validation failure (treats as miss)", async () => {
      mockGetCached.mockResolvedValue({ wrong: "shape" });
      const result = await SeoCacheService.get(baseRequest, testSchema);
      expect(result).toBeNull();
    });
  });

  describe("getOrFetch", () => {
    it("returns cached data without calling fetcher on hit", async () => {
      mockGetCached.mockResolvedValue({ items: ["cached"] });
      const fetcher = vi.fn(async () => ({ items: ["fresh"] }));
      const result = await SeoCacheService.getOrFetch(
        baseRequest,
        testSchema,
        fetcher,
      );
      expect(result.fromCache).toBe(true);
      expect(result.data).toEqual({ items: ["cached"] });
      expect(fetcher).not.toHaveBeenCalled();
    });

    it("calls fetcher on miss and returns fresh data", async () => {
      mockGetCached.mockResolvedValue(null);
      const fetcher = vi.fn(async () => ({ items: ["fresh"] }));
      const result = await SeoCacheService.getOrFetch(
        baseRequest,
        testSchema,
        fetcher,
      );
      expect(result.fromCache).toBe(false);
      expect(result.data).toEqual({ items: ["fresh"] });
      expect(fetcher).toHaveBeenCalledTimes(1);
    });
  });
});
