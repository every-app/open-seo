import { env } from "cloudflare:workers";
import { sortBy } from "remeda";
import { z } from "zod";
import { jsonCodec } from "@/shared/json";

/**
 * Cache TTL constants in seconds.
 */
export const CACHE_TTL = {
  /** Related keyword research results */
  researchResult: 86400,
} as const;

const jsonUnknownCodec = jsonCodec(z.unknown());

/**
 * Build a deterministic cache key from an endpoint slug and input params.
 * Uses FNV-1a hash for compactness.
 */
export function buildCacheKey(
  prefix: string,
  params: Record<string, unknown>,
): string {
  const raw = JSON.stringify(
    params,
    sortBy(Object.keys(params), (key) => key),
  );
  return `${prefix}:${fnv1a(raw)}`;
}

/**
 * Get a cached JSON value from KV. Returns null on miss.
 */
export async function getCached(key: string): Promise<unknown> {
  const value = await env.KV.get(key, "text");
  if (value === null) return null;
  const parsed = jsonUnknownCodec.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Store a JSON value in KV with a TTL in seconds.
 */
export async function setCached<T>(
  key: string,
  data: T,
  ttlSeconds: number,
): Promise<void> {
  await env.KV.put(key, JSON.stringify(data), {
    expirationTtl: ttlSeconds,
  });
}

/**
 * FNV-1a hash — fast, good distribution for cache keys.
 */
function fnv1a(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
