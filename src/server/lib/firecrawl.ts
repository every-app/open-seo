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

import { z } from "zod";
import { readBoundedText } from "@/server/lib/bounded-response";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";

const FIRECRAWL_API_BASE = "https://api.firecrawl.dev/v2";
// Firecrawl's own request timeout (ms), kept below the local abort so it can
// return its own timeout response before we give up and fall back.
const FIRECRAWL_API_TIMEOUT_MS = 20_000;
const FIRECRAWL_ABORT_MS = 25_000;
// This is a website reader, not a document reader. Firecrawl auto-parses PDFs
// and bills one credit per page, so bound the pages parsed to keep an arbitrary
// (possibly huge) document URL from burning unbounded credits.
const PDF_MAX_PAGES = 1;

/** Present only when the operator has configured Firecrawl. */
export function getFirecrawlApiKey(): Promise<string | undefined> {
  return getOptionalEnvValue("FIRECRAWL_API_KEY");
}

/**
 * Thrown when Firecrawl is unusable in a way that's likely systemic — the
 * service is unreachable, timed out, returned a non-2xx, sent an unparseable
 * body, or returned a payload whose shape no longer matches the API contract.
 * Callers use it to trip a circuit breaker and stop hammering a failing
 * service. Per-URL conditions are NOT errors: a well-formed response that
 * reports failure or has no usable content, or a body that exceeds the size
 * cap (one huge page/PDF), returns `null` so the caller falls back for just
 * that URL.
 */
export class FirecrawlUnavailableError extends Error {}

const scrapeResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      markdown: z.string().optional(),
      metadata: z.object({ title: z.string().nullish() }).optional(),
    })
    .optional(),
});

const mapResponseSchema = z.object({
  success: z.boolean(),
  links: z.array(z.object({ url: z.string().optional() })).optional(),
});

/**
 * POSTs to Firecrawl and returns the parsed JSON (wrapped) for the caller to
 * validate, or null when the body exceeded the size cap — that's a per-URL
 * condition (one huge page), not a service failure, so it must not trip the
 * breaker. Throws FirecrawlUnavailableError on any transport-level failure
 * (including a body-stream error or an unparseable body) so the caller can
 * trip its circuit breaker.
 */
async function postFirecrawl(
  apiKey: string,
  path: string,
  body: unknown,
): Promise<{ json: unknown } | null> {
  let text: string | null;
  try {
    const response = await fetch(`${FIRECRAWL_API_BASE}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(FIRECRAWL_ABORT_MS),
    });
    if (!response.ok) {
      throw new FirecrawlUnavailableError(
        `unexpected status ${response.status}`,
      );
    }
    // Body read stays inside the try so an abort/reset mid-stream surfaces as
    // FirecrawlUnavailableError rather than a raw AbortError.
    text = await readBoundedText(response);
  } catch (error) {
    if (error instanceof FirecrawlUnavailableError) throw error;
    throw new FirecrawlUnavailableError("request failed");
  }
  if (text === null) {
    return null; // body exceeded the size cap — fall back for this URL only
  }
  try {
    return { json: JSON.parse(text) as unknown };
  } catch {
    throw new FirecrawlUnavailableError("response was not valid JSON");
  }
}

/**
 * Scrapes one (already-validated) URL to clean markdown. Returns a page shaped
 * for scrape.ts, or null when Firecrawl reports failure / no usable content /
 * an oversized body for this URL (the caller then falls back to plain fetch
 * for it). Throws FirecrawlUnavailableError when Firecrawl is unreachable or
 * its response shape no longer matches the contract.
 */
export async function firecrawlScrapePage(
  apiKey: string,
  url: string,
  charLimit: number,
): Promise<{ url: string; title: string | null; text: string } | null> {
  const result = await postFirecrawl(apiKey, "/scrape", {
    url,
    formats: ["markdown"],
    timeout: FIRECRAWL_API_TIMEOUT_MS,
    parsers: [{ type: "pdf", maxPages: PDF_MAX_PAGES }],
  });
  if (result === null) return null;
  const parsed = scrapeResponseSchema.safeParse(result.json);
  if (!parsed.success) {
    throw new FirecrawlUnavailableError("unexpected scrape response shape");
  }
  if (!parsed.data.success || !parsed.data.data) return null;
  const text = (parsed.data.data.markdown ?? "").trim().slice(0, charLimit);
  if (text.length === 0) return null;
  return { url, title: parsed.data.data.metadata?.title ?? null, text };
}

/**
 * Discovers a site's page URLs via Firecrawl's /map, scoped to the origin (no
 * subdomains). Returns the URLs (possibly empty), or null when Firecrawl
 * reports failure or the response body is oversized. Throws
 * FirecrawlUnavailableError when Firecrawl is unreachable or its response
 * shape no longer matches the contract.
 */
export async function firecrawlMapUrls(
  apiKey: string,
  url: string,
  limit: number,
): Promise<string[] | null> {
  const result = await postFirecrawl(apiKey, "/map", {
    url,
    limit,
    includeSubdomains: false,
  });
  if (result === null) return null;
  const parsed = mapResponseSchema.safeParse(result.json);
  if (!parsed.success) {
    throw new FirecrawlUnavailableError("unexpected map response shape");
  }
  if (!parsed.data.success || !parsed.data.links) return null;
  return parsed.data.links
    .map((link) => link.url)
    .filter((value): value is string => typeof value === "string");
}
