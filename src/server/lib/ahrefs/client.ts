import { env } from "cloudflare:workers";
import { z } from "zod";
import { getEnvValueSync } from "@/server/lib/runtime-env";

// Ahrefs public domain rating endpoint is free-tier.
const endpoint = "https://api.ahrefs.com/v3/public/domain-rating-free";
const emptyRating = { domainRating: null };

type Rating = { domainRating: number | null };

export function isAhrefsConfigured(): boolean {
  return Boolean(getEnvValueSync(env, "AHREFS_API_KEY"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value)
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

const ratingShape = z
  .object({ domain_rating: z.number().min(0).max(100) })
  .partial();

function parseRating(value: unknown): Rating {
  const root = asRecord(value);
  const nested = asRecord(root?.domain_rating);
  for (const candidate of [nested, root]) {
    const parsed = ratingShape.safeParse(candidate);
    if (parsed.success && parsed.data.domain_rating !== undefined) {
      return { domainRating: parsed.data.domain_rating };
    }
  }
  return emptyRating;
}

export async function getFreeDomainRating(hostname: string): Promise<Rating> {
  const key = getEnvValueSync(env, "AHREFS_API_KEY");
  if (!key) return emptyRating;

  const url = new URL(endpoint);
  url.searchParams.set("target", hostname);
  const headers = { Authorization: `Bearer ${key}` };
  try {
    let response = await fetch(url, { headers });
    if (response.status === 400 && (await response.text()).toLowerCase().includes("date")) {
      url.searchParams.set("date", new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
      response = await fetch(url, { headers });
    }
    if (!response.ok) return emptyRating;
    return parseRating(await response.json());
  } catch {
    return emptyRating;
  }
}
