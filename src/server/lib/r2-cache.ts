import { env } from "cloudflare:workers";
import { sortBy } from "remeda";
import { describeError } from "@/server/lib/errors";

/**
 * Cache TTL constants in seconds.
 */
export const CACHE_TTL = {
  /** Related keyword research results */
  researchResult: 86400,
} as const;

const CACHE_PREFIX = "dataforseo-cache/";

export const AI_SEARCH_PROMPT_CACHE_NAMESPACE = "ai-search:prompt-response";

/** Full R2 object-key prefix for a cache namespace, for prefix listing. */
export function cacheObjectPrefix(namespace: string): string {
  return `${CACHE_PREFIX}${namespace}:`;
}

/**
 * Build a deterministic cache key from an endpoint slug and input params.
 * Uses a SHA-256 digest for stability across runtimes.
 */
export async function buildCacheKey(
  prefix: string,
  params: Record<string, unknown>,
): Promise<string> {
  const raw = JSON.stringify(
    Object.fromEntries(sortBy(Object.entries(params), ([key]) => key)),
  );

  return `${prefix}:${await sha256Hex(raw)}`;
}

/**
 * Get a cached JSON value from R2. Returns null on miss or expiry, and when R2
 * is failing, so the caller fetches live instead of failing the user's action.
 * Callers should validate the shape with Zod before trusting it — schema
 * drift between writes and reads is otherwise silent.
 */
export async function getCached(key: string): Promise<unknown> {
  try {
    return await getCachedStrict(key);
  } catch (error) {
    console.error(`r2-cache.read failed (${key}): ${describeError(error)}`);
    return null;
  }
}

/**
 * getCached for entries whose miss would buy paid work again (read receipts)
 * or tell the caller something false (a saved result "expired"): an R2
 * failure throws instead of reading as a miss.
 */
export async function getCachedStrict(key: string): Promise<unknown> {
  const obj = await env.R2.get(`${CACHE_PREFIX}${key}`);
  if (!obj) return null;

  const expiresAt = obj.customMetadata?.expiresAt;
  if (expiresAt && Date.parse(expiresAt) < Date.now()) return null;

  const body = await obj.text();
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

/**
 * Store a JSON value in R2 with a soft TTL via custom metadata.
 */
export async function setCached<T>(
  key: string,
  data: T,
  ttlSeconds: number,
  metadata: Record<string, string> = {},
): Promise<void> {
  await env.R2.put(`${CACHE_PREFIX}${key}`, JSON.stringify(data), {
    httpMetadata: { contentType: "application/json" },
    customMetadata: {
      ...metadata,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    },
  });
}

/**
 * Compute a deterministic SHA-256 digest for cache keys.
 */
async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
