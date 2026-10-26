// Lightweight, dependency-free site reading shared by the chat agents
// (onboarding + SAM): discover URLs from the sitemap (falling back to the
// homepage) and extract readable text from each page via plain fetch. This is
// enough to let the model infer what a site does. JS-heavy sites degrade
// gracefully (less text); a Browser Rendering upgrade can slot in behind this
// same interface later.

import { publicFetch } from "@/server/lib/public-fetch";
import { normalizeAndValidateStartUrl } from "@/server/lib/audit/url-policy";
import { RenderedPageService } from "@/server/lib/audit/rendered-page";
import { getContextFetch } from "@/server/lib/provider-access";
import type { RenderUsage } from "@/shared/audit-rendering";

const MAX_PAGES = 5;
const PER_PAGE_CHAR_LIMIT = 4000;
const FETCH_TIMEOUT_MS = 10_000;
// Covers chains like https://apex -> http://www -> https://www.
const MAX_REDIRECTS = 3;
const MAX_RESPONSE_BYTES = 2_000_000;
const USER_AGENT = "OpenSEO-Onboarding/1.0 (+https://openseo.so)";

type ScrapedPage = {
  url: string;
  title: string | null;
  text: string;
};

type SiteReadResult = {
  pages: ScrapedPage[];
  /** True when we couldn't read any page (blocked, offline, etc.). */
  blocked: boolean;
};

// Bounded read: accumulate up to MAX_RESPONSE_BYTES regardless of whether
// content-length is present (chunked / CDN responses often omit it).
export async function readBoundedText(
  response: Response,
): Promise<string | null> {
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
 * With `contextUsage`, a page the plain fetch can't read is read through
 * Context, because many sites throttle or block Cloudflare Workers (Shopify's
 * edge, bot protection). Its credits are added to `contextUsage` for the caller
 * to bill. A missing page (404/410) is not retried there.
 */
async function fetchText(
  url: string,
  contextUsage?: RenderUsage,
): Promise<string | null> {
  let current = url;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const response = await publicFetch(current, {
        headers: { "user-agent": USER_AGENT, accept: "text/html,*/*" },
        // Manual redirects so we can re-validate each hop against the SSRF guard;
        // redirect:"follow" would let a 30x to an internal host bypass it.
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (response.ok) return await readBoundedText(response);
      const location = response.headers.get("location");
      if (response.status < 300 || response.status >= 400 || !location) {
        await response.body?.cancel();
        if (response.status === 404 || response.status === 410) return null;
        break;
      }
      // Re-validates host, blocks private IPs, and does DoH DNS resolution.
      // A blocked or invalid destination is not sent to Context either: it
      // follows redirects itself and would reach the blocked host.
      try {
        current = await normalizeAndValidateStartUrl(
          new URL(location, current).toString(),
        );
      } catch {
        return null;
      }
    }
  } catch {
    // Timeouts, TLS and network errors fall through to Context.
  }
  if (!contextUsage) return null;
  const contextFetch = await getContextFetch();
  if (!contextFetch) return null;
  try {
    return (
      await RenderedPageService.renderPage(current, {
        contextFetch,
        usage: contextUsage,
      })
    ).html;
  } catch {
    return null;
  }
}

/**
 * Pulls page URLs from a sitemap body. Resolves relative/protocol-relative
 * <loc> entries against the origin and keeps same-origin HTML pages only. Nested
 * sitemap files (a sitemap index) are skipped rather than fetched as pages —
 * good enough for v1; we fall back to the homepage if nothing usable is found.
 */
function parseSitemapUrls(xml: string, origin: string): string[] {
  const urls: string[] = [];
  const regex = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    let resolved: string;
    try {
      resolved = new URL(match[1], origin).toString();
    } catch {
      continue;
    }
    if (resolved.startsWith(origin) && !resolved.endsWith(".xml")) {
      urls.push(resolved);
    }
  }
  return urls;
}

function extractTitle(html: string): string | null {
  const match = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  return match ? decodeEntities(match[1].trim()) : null;
}

/** Strips scripts/styles/tags and collapses whitespace into readable text. */
function htmlToText(html: string): string {
  const withoutBlocks = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const text = withoutBlocks
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return decodeEntities(text);
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** Fetches one (already-validated) URL and shapes it as a page, or null if it
 * couldn't be read or yielded no text. */
async function scrapePage(
  url: string,
  contextUsage?: RenderUsage,
): Promise<ScrapedPage | null> {
  const html = await fetchText(url, contextUsage);
  if (!html) {
    return null;
  }
  const text = htmlToText(html).slice(0, PER_PAGE_CHAR_LIMIT);
  if (text.length === 0) {
    return null;
  }
  // Extracted titles and shortened text can retain their entire source string
  // in V8. Detach them before pages accumulate in results or chat transcripts.
  return structuredClone({ url, title: extractTitle(html), text });
}

/**
 * Reads a specific list of page URLs as plain text — used when the caller names
 * exact pages (the user's own or a competitor's) rather than asking us to
 * discover a site. Each URL is independently run through the SSRF guard, so a
 * blocked or unreachable URL is skipped rather than failing the batch.
 * With `contextUsage`, pages the plain fetch can't read are read through Context.
 */
export async function readPages(
  urls: string[],
  maxPages: number = MAX_PAGES,
  contextUsage?: RenderUsage,
): Promise<SiteReadResult> {
  const pages: ScrapedPage[] = [];
  for (const rawUrl of urls.slice(0, maxPages)) {
    let url: string;
    try {
      // Re-validates host, blocks private/metadata IPs, does DoH DNS resolution.
      url = await normalizeAndValidateStartUrl(rawUrl);
    } catch {
      continue; // blocked or unparseable URL
    }
    const page = await scrapePage(url, contextUsage);
    if (page) {
      pages.push(page);
    }
  }

  return { pages, blocked: pages.length === 0 };
}

/**
 * Lists a site's page URLs without reading them: the homepage plus what the
 * sitemap declares, capped at `limit`. Lets an agent see what a site has and
 * choose which pages to read (readPages) instead of blindly taking the first N.
 */
export async function discoverSiteUrls(
  domain: string,
  limit: number,
): Promise<{ urls: string[]; blocked: boolean }> {
  let rootUrl: string;
  try {
    rootUrl = await normalizeAndValidateStartUrl(domain);
  } catch {
    // Blocked (private/metadata host) or unparseable domain — nothing to list.
    return { urls: [], blocked: true };
  }
  const origin = new URL(rootUrl).origin;

  const sitemap = await fetchText(`${origin}/sitemap.xml`);
  const discovered = sitemap ? parseSitemapUrls(sitemap, origin) : [];
  const urls = [rootUrl, ...discovered.filter((url) => url !== rootUrl)];
  return { urls: urls.slice(0, limit), blocked: false };
}

/**
 * Discovers a site's representative URLs (homepage + sitemap) and reads them.
 * Just URL discovery on top of readPages, which does the validated fetching.
 */
export async function readSite(
  domain: string,
  maxPages: number = MAX_PAGES,
  contextUsage?: RenderUsage,
): Promise<SiteReadResult> {
  const discovered = await discoverSiteUrls(domain, maxPages);
  if (discovered.blocked) {
    return { pages: [], blocked: true };
  }
  const site = await readPages(discovered.urls, maxPages, contextUsage);
  const root = new URL(discovered.urls[0]);
  if (!site.blocked || root.hostname.startsWith("www.")) return site;
  // Some sites only serve their www host (e.g. the bare domain's TLS
  // certificate is missing), so retry there before giving up.
  root.hostname = `www.${root.hostname}`;
  // The setter ignores invalid hosts, so IP literals keep their original host.
  if (!root.hostname.startsWith("www.")) return site;
  return readSite(root.toString(), maxPages, contextUsage);
}
