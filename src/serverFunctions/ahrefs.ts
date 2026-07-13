import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { chunk } from "remeda";
import { z } from "zod";
import { normalizeDomainInput } from "@/server/lib/domainUtils";
import { requireProjectContext } from "@/serverFunctions/middleware";

/**
 * Ahrefs publishes a free, keyless Domain Rating lookup. We use it to enrich the
 * Backlinks table on demand — no billing, no stored data. Every result (a DR, or
 * `null` when Ahrefs has no rating) is cached in KV for a day so re-opening the
 * table is free.
 */
const AHREFS_DR_ENDPOINT =
  "https://api.ahrefs.com/v3/public/domain-rating-free";
const CACHE_PREFIX = "ahrefs-dr:";
const CACHE_TTL_SECONDS = 86_400; // 24 hours
const FETCH_TIMEOUT_MS = 5_000;
const FETCH_BATCH_SIZE = 20;
const MAX_DOMAINS_PER_CALL = 100;

const domainRatingsInputSchema = z.object({
  projectId: z.string().min(1),
  domains: z.array(z.string().trim().min(1).max(253)).max(MAX_DOMAINS_PER_CALL),
});

const ahrefsResponseSchema = z.object({
  domain_rating: z.object({
    domain_rating: z.number().min(0).max(100),
  }),
});

export const getAhrefsDomainRatings = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(domainRatingsInputSchema)
  .handler(async ({ data }) => {
    const result: Record<string, number | null> = {};

    // Several original inputs can collapse to one normalized domain (www/non-www,
    // protocol variants). Resolve each normalized domain once, then fan the value
    // back out to every original key the client will look up by.
    const originalsByDomain = new Map<string, string[]>();
    for (const original of data.domains) {
      const domain = normalizeDomainInput(original, true);
      const existing = originalsByDomain.get(domain);
      if (existing) existing.push(original);
      else originalsByDomain.set(domain, [original]);
    }

    const ratings = new Map<string, number | null>();
    for (const batch of chunk(
      [...originalsByDomain.keys()],
      FETCH_BATCH_SIZE,
    )) {
      const resolved = await Promise.all(
        batch.map(async (domain) => {
          // A single failure (KV blip, etc.) must not fail the whole call.
          try {
            return [domain, await resolveDomainRating(domain)] as const;
          } catch {
            return [domain, null] as const;
          }
        }),
      );
      for (const [domain, dr] of resolved) ratings.set(domain, dr);
    }

    for (const [domain, originals] of originalsByDomain) {
      const dr = ratings.get(domain) ?? null;
      for (const original of originals) result[original] = dr;
    }

    return result;
  });

/** Cache-first lookup for a single normalized domain. */
async function resolveDomainRating(domain: string): Promise<number | null> {
  const cacheKey = `${CACHE_PREFIX}${domain}`;
  // KV returns JS `null` only when the key is absent; a cached "no rating" is
  // stored as the string "null", so cache hits (including nulls) skip the fetch.
  const cached = await env.KV.get(cacheKey);
  if (cached !== null) return parseCachedRating(cached);

  const dr = await fetchDomainRating(domain);
  await env.KV.put(cacheKey, JSON.stringify(dr), {
    expirationTtl: CACHE_TTL_SECONDS,
  });
  return dr;
}

async function fetchDomainRating(domain: string): Promise<number | null> {
  const response = await fetch(
    `${AHREFS_DR_ENDPOINT}?target=${encodeURIComponent(domain)}`,
    { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
  );
  if (!response.ok) {
    throw new Error(`Ahrefs DR lookup failed with status ${response.status}`);
  }

  const parsed = ahrefsResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error("Ahrefs DR lookup returned an unexpected response");
  }

  // Ahrefs returns 200 with DR 0 for domains it has no rating for (new or
  // unknown), so treat 0 as "no rating" — the table renders it as "—".
  const dr = parsed.data.domain_rating.domain_rating;
  return dr > 0 ? dr : null;
}

function parseCachedRating(raw: string): number | null {
  try {
    const value: unknown = JSON.parse(raw);
    // Mirror fetchDomainRating: a DR of 0 means "no rating", so render it as "—".
    return typeof value === "number" && value > 0 ? value : null;
  } catch {
    return null;
  }
}
