import { sortBy } from "remeda";
import { z } from "zod";
import { jsonCodec } from "@/shared/json";
import { getWorkersBinding } from "@/server/lib/runtime-env";

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
  const kv = await getKvNamespace();
  const value = await kv.get(key, "text");
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
  const kv = await getKvNamespace();
  await kv.put(key, JSON.stringify(data), {
    expirationTtl: ttlSeconds,
  });
}

async function getKvNamespace(): Promise<KVNamespace> {
  const binding = await getWorkersBinding("KV");
  if (isKvNamespace(binding)) {
    return binding;
  }

  throw new Error("KV binding is not configured correctly");
}

function isKvNamespace(value: unknown): value is KVNamespace {
  return (
    typeof value === "object" &&
    value !== null &&
    "get" in value &&
    typeof value.get === "function" &&
    "put" in value &&
    typeof value.put === "function"
  );
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
