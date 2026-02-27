/**
 * robots.txt and sitemap.xml discovery for the site audit crawler.
 */
import robotsParser from "robots-parser";
import { XMLParser } from "fast-xml-parser";
import { isSameOrigin, normalizeUrl } from "./url-utils";

const SITEMAP_FETCH_TIMEOUT_MS = 15_000;
const MAX_SITEMAP_DEPTH = 3;
const MAX_SITEMAP_DOCS = 300;
const SITEMAP_CONCURRENCY = 5;
const SITEMAP_RETRIES = 1;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  isArray: (name) => name === "sitemap" || name === "url",
});

export interface RobotsResult {
  isAllowed: (url: string) => boolean;
  sitemapUrls: string[];
}

/**
 * Fetch and parse robots.txt for a given origin.
 * Returns a helper to check if URLs are allowed + discovered sitemap URLs.
 */
export async function fetchRobotsTxt(origin: string): Promise<RobotsResult> {
  const robotsUrl = `${origin}/robots.txt`;
  try {
    const response = await fetch(robotsUrl, {
      headers: { "User-Agent": "OpenSEO-Audit/1.0" },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      // No robots.txt = everything allowed
      return {
        isAllowed: () => true,
        sitemapUrls: [],
      };
    }

    const text = await response.text();
    const robots = robotsParser(robotsUrl, text);

    return {
      isAllowed: (url: string) => robots.isAllowed(url) ?? true,
      sitemapUrls: robots.getSitemaps(),
    };
  } catch (error) {
    console.warn("Failed to fetch robots.txt:", error);
    return {
      isAllowed: () => true,
      sitemapUrls: [],
    };
  }
}

/**
 * Fetch and parse a sitemap (supports sitemap index recursion).
 * Returns a flat list of page URLs found.
 */
function isProbablySitemapXml(
  contentType: string | null,
  body: string,
): boolean {
  if (contentType?.toLowerCase().includes("xml")) {
    return true;
  }

  const trimmed = body.trimStart().toLowerCase();
  return (
    trimmed.startsWith("<?xml") ||
    trimmed.startsWith("<urlset") ||
    trimmed.startsWith("<sitemapindex")
  );
}

function getSitemapLocations(input: unknown): string[] {
  if (!input) return [];
  const entries: Array<{ loc?: string }> = Array.isArray(input)
    ? (input as Array<{ loc?: string }>)
    : ([input] as Array<{ loc?: string }>);
  return entries
    .map((entry) => entry.loc)
    .filter((loc): loc is string => typeof loc === "string");
}

function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { name?: string };
  return maybe.name === "TimeoutError";
}

async function fetchSitemapDocumentWithRetry(sitemapUrl: string): Promise<{
  nestedSitemaps: string[];
  pageUrls: string[];
  timedOut: boolean;
}> {
  const normalizedSitemapUrl = normalizeUrl(sitemapUrl);
  if (!normalizedSitemapUrl) {
    return { nestedSitemaps: [], pageUrls: [], timedOut: false };
  }

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= SITEMAP_RETRIES; attempt++) {
    try {
      const response = await fetch(normalizedSitemapUrl, {
        headers: { "User-Agent": "OpenSEO-Audit/1.0" },
        signal: AbortSignal.timeout(SITEMAP_FETCH_TIMEOUT_MS),
      });

      const finalUrl = normalizeUrl(response.url, normalizedSitemapUrl);
      if (!finalUrl || !isSameOrigin(finalUrl, normalizedSitemapUrl)) {
        return { nestedSitemaps: [], pageUrls: [], timedOut: false };
      }

      if (!response.ok) {
        return { nestedSitemaps: [], pageUrls: [], timedOut: false };
      }

      const body = await response.text();
      if (!isProbablySitemapXml(response.headers.get("content-type"), body)) {
        return { nestedSitemaps: [], pageUrls: [], timedOut: false };
      }

      const parsed = xmlParser.parse(body);
      const nestedSitemaps = getSitemapLocations(parsed.sitemapindex?.sitemap)
        .map((loc) => normalizeUrl(loc, finalUrl))
        .filter((loc): loc is string => loc !== null);
      const pageUrls = getSitemapLocations(parsed.urlset?.url)
        .map((loc) => normalizeUrl(loc, finalUrl))
        .filter((loc): loc is string => loc !== null);

      return { nestedSitemaps, pageUrls, timedOut: false };
    } catch (error) {
      lastError = error;
      if (!isTimeoutError(error) || attempt === SITEMAP_RETRIES) {
        break;
      }
    }
  }

  return {
    nestedSitemaps: [],
    pageUrls: [],
    timedOut: isTimeoutError(lastError),
  };
}

/**
 * Discover all page URLs from robots.txt + sitemaps for an origin.
 * Also tries the default /sitemap.xml if not listed in robots.txt.
 */
export async function discoverUrls(
  origin: string,
  maxPages = 50,
): Promise<{ urls: string[]; robots: RobotsResult; sitemapUrls: Set<string> }> {
  const robots = await fetchRobotsTxt(origin);

  // Collect sitemap URLs: from robots.txt + default location
  const sitemapSources = new Set(robots.sitemapUrls);
  sitemapSources.add(`${origin}/sitemap.xml`);

  const maxDiscoveredUrls = Math.min(Math.max(maxPages * 20, 500), 50_000);
  const allUrls = new Set<string>();

  const queue: Array<{ url: string; depth: number }> = Array.from(
    sitemapSources,
  )
    .map((url) => normalizeUrl(url, origin))
    .filter((url): url is string => url !== null)
    .filter((url) => isSameOrigin(url, origin))
    .map((url) => ({ url, depth: MAX_SITEMAP_DEPTH }));
  const seenSitemapDocs = new Set<string>();
  let fetchedDocs = 0;
  let failedDocs = 0;
  let timedOutDocs = 0;

  while (queue.length > 0 && allUrls.size < maxDiscoveredUrls) {
    if (fetchedDocs >= MAX_SITEMAP_DOCS) {
      break;
    }
    const batch = queue.splice(0, SITEMAP_CONCURRENCY);
    await Promise.all(
      batch.map(async ({ url, depth }) => {
        const normalizedUrl = normalizeUrl(url);
        if (
          !normalizedUrl ||
          !isSameOrigin(normalizedUrl, origin) ||
          depth <= 0 ||
          seenSitemapDocs.has(normalizedUrl)
        ) {
          return;
        }

        seenSitemapDocs.add(normalizedUrl);
        fetchedDocs += 1;

        const result = await fetchSitemapDocumentWithRetry(normalizedUrl);
        if (
          result.pageUrls.length === 0 &&
          result.nestedSitemaps.length === 0
        ) {
          failedDocs += 1;
          if (result.timedOut) {
            timedOutDocs += 1;
          }
          return;
        }

        for (const pageUrl of result.pageUrls) {
          if (!isSameOrigin(pageUrl, origin)) continue;
          if (allUrls.size >= maxDiscoveredUrls) break;
          allUrls.add(pageUrl);
        }

        if (depth <= 1) return;

        for (const nestedUrl of result.nestedSitemaps) {
          if (!isSameOrigin(nestedUrl, origin)) continue;
          if (!seenSitemapDocs.has(nestedUrl)) {
            queue.push({ url: nestedUrl, depth: depth - 1 });
          }
        }
      }),
    );
  }

  if (failedDocs > 0) {
    console.warn(
      `Sitemap discovery completed with partial failures for ${origin}: fetched=${fetchedDocs}, failed=${failedDocs}, timedOut=${timedOutDocs}, discoveredUrls=${allUrls.size}`,
    );
  }

  return {
    urls: Array.from(allUrls),
    robots,
    sitemapUrls: allUrls,
  };
}
