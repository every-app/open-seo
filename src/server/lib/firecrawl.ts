// Optional Firecrawl-backed site reading for the chat agents' site reader
// (scrape.ts). When FIRECRAWL_API_KEY is set, pages are read through Firecrawl
// instead of plain fetch: it renders JS-heavy sites and returns clean markdown,
// and its /map endpoint discovers URLs beyond what a sitemap lists — the
// "Browser Rendering upgrade [that] can slot in behind this same interface"
// scrape.ts anticipates. Without a key, callers fall back to the built-in fetch
// path, so this stays entirely optional.
//
// Firecrawl performs the outbound request on its own infrastructure, so callers
// are still responsible for validating URLs against the SSRF/host policy before
// handing them here (scrape.ts does this via normalizeAndValidateStartUrl).
//
// Called over the REST API (v2) with plain fetch to match this subtree's
// dependency-free style and avoid bundling the SDK into the Workers runtime.
// Docs: https://docs.firecrawl.dev

import { getOptionalEnvValue } from "@/server/lib/runtime-env";

const FIRECRAWL_API_BASE = "https://api.firecrawl.dev/v2";
const FIRECRAWL_TIMEOUT_MS = 30_000;

/** Present only when the operator has configured Firecrawl. */
export function getFirecrawlApiKey(): Promise<string | undefined> {
  return getOptionalEnvValue("FIRECRAWL_API_KEY");
}

type FirecrawlScrapeResponse = {
  success?: boolean;
  data?: {
    markdown?: string;
    metadata?: { title?: string | null };
  };
};

type FirecrawlMapResponse = {
  success?: boolean;
  links?: Array<{ url?: string }>;
};

async function postFirecrawl<T>(
  apiKey: string,
  path: string,
  body: unknown,
): Promise<T | null> {
  let response: Response;
  try {
    response = await fetch(`${FIRECRAWL_API_BASE}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(FIRECRAWL_TIMEOUT_MS),
    });
  } catch {
    return null; // network error / timeout — let the caller fall back
  }
  if (!response.ok) return null;
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Scrapes one (already-validated) URL to clean markdown. Returns a page shaped
 * for scrape.ts, or null if Firecrawl failed or the page yielded no text (the
 * caller then falls back to the plain-fetch path).
 */
export async function firecrawlScrapePage(
  apiKey: string,
  url: string,
  charLimit: number,
): Promise<{ url: string; title: string | null; text: string } | null> {
  const body = await postFirecrawl<FirecrawlScrapeResponse>(apiKey, "/scrape", {
    url,
    formats: ["markdown"],
  });
  if (!body?.success) return null;
  const text = (body.data?.markdown ?? "").trim().slice(0, charLimit);
  if (text.length === 0) return null;
  return { url, title: body.data?.metadata?.title ?? null, text };
}

/**
 * Discovers a site's page URLs via Firecrawl's /map. Returns the discovered
 * URLs (domain-scoped by the endpoint), or null if the call failed so the
 * caller can fall back to sitemap parsing.
 */
export async function firecrawlMapUrls(
  apiKey: string,
  url: string,
  limit: number,
): Promise<string[] | null> {
  const body = await postFirecrawl<FirecrawlMapResponse>(apiKey, "/map", {
    url,
    limit,
  });
  if (!body?.success) return null;
  return (body.links ?? [])
    .map((link) => link?.url)
    .filter((value): value is string => typeof value === "string");
}
