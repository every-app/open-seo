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