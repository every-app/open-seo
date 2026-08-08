import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import { getCacheTtl } from "./config";
import type { SEODataRequest } from "./types";
import { z, type ZodTypeAny } from "zod";

/**
 * Centralized cache service for SEO data. Wraps the existing R2 cache
 * primitives with per-data-type TTL configuration and deterministic key
 * generation that includes all parameters that materially affect the result.
 */

// Module-level functions rather than a class — the existing codebase style
// (see r2-cache.ts) uses free functions, not static-only classes.

/**
 * Build a deterministic cache key from the request. Includes all parameters
 * that materially affect the result: data type, keyword/domain/url,
 * location, language, device, date range, and constraints.
 *
 * Format: {dataType}:{organizationId}:{sha256(params)}
 */
async function buildKey(request: SEODataRequest): Promise<string> {
  const params: Record<string, unknown> = {
    dataType: request.dataType,
    organizationId: request.billingCustomer.organizationId,
    keyword: request.keyword,
    keywords: request.keywords,
    domain: request.domain,
    url: request.url,
    urls: request.urls,
    locationCode: request.locationCode,
    languageCode: request.languageCode,
    device: request.device,
    dateFrom: request.dateFrom,
    dateTo: request.dateTo,
    constraints: request.constraints,
  };
  return buildCacheKey(`seo:${request.dataType}`, params);
}

/**
 * Read a cached value. Returns null on miss, expiry, or schema validation
 * failure (schema drift between writes and reads is treated as a miss).
 */
async function get<T>(
  request: SEODataRequest,
  schema: ZodTypeAny,
): Promise<{ data: T; key: string } | null> {
  const key = await buildKey(request);
  const raw = await getCached(key);
  if (raw === null) return null;

  const parsed = schema.safeParse(raw);
  if (!parsed.success) return null;

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- safeParse narrows to T
  return { data: parsed.data as T, key };
}

/**
 * Write a value to the cache with the TTL configured for its data type.
 * Uses `waitUntil` semantics — callers should wrap in `waitUntil` if the
 * response is already sent (the existing pattern in the codebase).
 */
async function set(
  request: SEODataRequest,
  key: string,
  data: unknown,
): Promise<void> {
  const ttl = await getCacheTtl(request.dataType);
  await setCached(key, data, ttl);
}

/**
 * Full cache-first flow: check cache, return on hit; on miss, call the
 * fetcher, cache the result, and return it. The fetcher receives the cache
 * key so it can reuse it for the write.
 */
async function getOrFetch<T>(
  request: SEODataRequest,
  schema: ZodTypeAny,
  fetcher: (key: string) => Promise<T>,
): Promise<{ data: T; fromCache: boolean; key: string }> {
  const key = await buildKey(request);

  const raw = await getCached(key);
  if (raw !== null) {
    const parsed = schema.safeParse(raw);
    if (parsed.success) {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- safeParse narrows to T
      return { data: parsed.data as T, fromCache: true, key };
    }
  }

  const data = await fetcher(key);
  return { data, fromCache: false, key };
}

export const SeoCacheService = { buildKey, get, set, getOrFetch };

/**
 * A passthrough schema that accepts any valid JSON-serializable value.
 * Used when a provider's result shape is not easily narrowed to a Zod schema.
 */
export const passthroughSchema = z.unknown();