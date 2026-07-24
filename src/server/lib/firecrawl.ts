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
import { getOptionalEnvValue } from "@/server/lib/runtime-env";

const FIRECRAWL_API_BASE = "https://api.firecrawl.dev/v2";
// Firecrawl's own request timeout (ms), kept below the local abort so it can
// return its own timeout response before we give up and fall back.
const FIRECRAWL_API_TIMEOUT_MS = 20_000;
const FIRECRAWL_ABORT_MS = 25_000;
// Cap the body we buffer before parsing, mirroring scrape.ts's plain-reader
// guard so an oversized markdown/document response can't be fully buffered in
// the Worker.
const MAX_RESPONSE_BYTES = 5_000_000;
// This is a website reader, not a document reader. Firecrawl auto-parses PDFs
// and bills one credit per page, so bound the pages parsed to keep an arbitrary
// (possibly huge) document URL from burning unbounded credits.
const PDF_MAX_PAGES = 1;

/** Present only when the operator has configured Firecrawl. */
export function getFirecrawlApiKey(): Promise<string | undefined> {
  return getOptionalEnvValue("FIRECRAWL_API_KEY");
}

/**
 * Thrown when Firecrawl is unusable at the transport level — unreachable,
 * timed out, non-2xx, or an oversized/unparseable body. Callers use it to trip
 * a per-batch circuit breaker and stop hammering a failing service. A
 * well-formed response that simply has no useful content is NOT an error: those
 * return `null` so the caller falls back for just that URL.
 */
export class FirecrawlUnavailableError extends Error {}

const scrapeResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    markdown: z.string().optional(),
    metadata: z.object({ title: z.string().nullish() }).optional(),
  }),
});

const mapResponseSchema = z.object({
  success: z.literal(true),
  links: z.array(z.object({ url: z.string().optional() })),
});

/** Reads the body up to a byte cap, returning null if it overflows. */
async function readBoundedText(response: Response): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let result = "";
  let bytesRead = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    if (bytesRead > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      return null;
    }
    result += decoder.decode(value, { stream: true });
  }
  result += decoder.decode();
  return result;
}

/**
 * POSTs to Firecrawl and returns the parsed JSON as `unknown` for the caller to
 * validate. Throws FirecrawlUnavailableError on any transport-level failure so
 * the caller can trip its circuit breaker.
 */
async function postFirecrawl(
  apiKey: string,
  path: string,
  body: unknown,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${FIRECRAWL_API_BASE}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(FIRECRAWL_ABORT_MS),
    });
  } catch {
    throw new FirecrawlUnavailableError("request failed");
  }
  if (!response.ok) {
    throw new FirecrawlUnavailableError(`unexpected status ${response.status}`);
  }
  const text = await readBoundedText(response);
  if (text === null) {
    throw new FirecrawlUnavailableError("response exceeded size limit");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new FirecrawlUnavailableError("response was not valid JSON");
  }
}

/**
 * Scrapes one (already-validated) URL to clean markdown. Returns a page shaped
 * for scrape.ts, or null when the response is well-formed but has no usable
 * content (the caller then falls back to plain fetch for this URL). Throws
 * FirecrawlUnavailableError when Firecrawl itself is unreachable.
 */
export async function firecrawlScrapePage(
  apiKey: string,
  url: string,
  charLimit: number,
): Promise<{ url: string; title: string | null; text: string } | null> {
  const json = await postFirecrawl(apiKey, "/scrape", {
    url,
    formats: ["markdown"],
    timeout: FIRECRAWL_API_TIMEOUT_MS,
    parsers: [{ type: "pdf", maxPages: PDF_MAX_PAGES }],
  });
  const parsed = scrapeResponseSchema.safeParse(json);
  if (!parsed.success) return null;
  const text = (parsed.data.data.markdown ?? "").trim().slice(0, charLimit);
  if (text.length === 0) return null;
  return { url, title: parsed.data.data.metadata?.title ?? null, text };
}

/**
 * Discovers a site's page URLs via Firecrawl's /map, scoped to the origin (no
 * subdomains, matching the sitemap path's exact-origin contract). Returns the
 * URLs, or null when none resolve. Throws FirecrawlUnavailableError when
 * Firecrawl itself is unreachable.
 */
export async function firecrawlMapUrls(
  apiKey: string,
  url: string,
  limit: number,
): Promise<string[] | null> {
  const json = await postFirecrawl(apiKey, "/map", {
    url,
    limit,
    includeSubdomains: false,
  });
  const parsed = mapResponseSchema.safeParse(json);
  if (!parsed.success) return null;
  return parsed.data.links
    .map((link) => link.url)
    .filter((value): value is string => typeof value === "string");
}
