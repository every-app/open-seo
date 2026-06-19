// Lightweight, dependency-free site reading for onboarding: discover a few URLs
// from the sitemap (falling back to the homepage) and extract readable text from
// each page via plain fetch. This is enough to let the model infer what a site
// does. JS-heavy sites degrade gracefully (less text); a Browser Rendering
// upgrade can slot in behind this same interface later.

import { normalizeAndValidateStartUrl } from "@/server/lib/audit/url-policy";

const MAX_PAGES = 5;
const PER_PAGE_CHAR_LIMIT = 4000;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 2_000_000;
const USER_AGENT = "OpenSEO-Onboarding/1.0 (+https://openseo.so)";

type ScrapedPage = {
  url: string;
  title: string | null;
  text: string;
};

type SiteReadResult = {
  rootUrl: string;
  pages: ScrapedPage[];
  /** True when we couldn't read any page (blocked, offline, etc.). */
  blocked: boolean;
};

// Bounded read: accumulate up to MAX_RESPONSE_BYTES regardless of whether
// content-length is present (chunked / CDN responses often omit it).
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

async function fetchText(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html,*/*" },
      // Manual redirects so we can re-validate each hop against the SSRF guard;
      // redirect:"follow" would let a 30x to an internal host bypass it.
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return null;
      let redirectUrl: string;
      try {
        // Re-validates host, blocks private IPs, and does DoH DNS resolution.
        redirectUrl = await normalizeAndValidateStartUrl(
          new URL(location, url).toString(),
        );
      } catch {
        return null; // blocked or invalid redirect destination
      }
      // One hop only; fetch the validated destination without following further.
      const redirected = await fetch(redirectUrl, {
        headers: { "user-agent": USER_AGENT, accept: "text/html,*/*" },
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!redirected.ok) return null;
      return await readBoundedText(redirected);
    }

    if (!response.ok) return null;
    return await readBoundedText(response);
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

/** Discovers and reads up to MAX_PAGES pages of a site as plain text. */
export async function readSite(domain: string): Promise<SiteReadResult> {
  let rootUrl: string;
  try {
    rootUrl = await normalizeAndValidateStartUrl(domain);
  } catch {
    // Blocked (private/metadata host) or unparseable domain — nothing to read.
    return { rootUrl: `https://${domain}`, pages: [], blocked: true };
  }
  const origin = new URL(rootUrl).origin;

  // Prefer the sitemap for representative URLs; always include the homepage.
  const sitemap = await fetchText(`${origin}/sitemap.xml`);
  const discovered = sitemap ? parseSitemapUrls(sitemap, origin) : [];
  const targets = [
    rootUrl,
    ...discovered.filter((url) => url !== rootUrl),
  ].slice(0, MAX_PAGES);

  const pages: ScrapedPage[] = [];
  for (const url of targets) {
    const html = await fetchText(url);
    if (!html) {
      continue;
    }
    const text = htmlToText(html).slice(0, PER_PAGE_CHAR_LIMIT);
    if (text.length === 0) {
      continue;
    }
    pages.push({ url, title: extractTitle(html), text });
  }

  return { rootUrl, pages, blocked: pages.length === 0 };
}
