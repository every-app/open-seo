import type { SerpLiveItem } from "@/server/lib/dataforseo";

// Matching a published copy's URL against Google results and AI sources.
// Queued SERP reads carry each page's own URL; the scheme, "www.", a trailing
// slash, the query and the fragment don't make it a different page.

function normalizeUrl(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = decodeURI(parsed.pathname).replace(/\/+$/, "");
    return `${host}${path}`;
  } catch {
    return null;
  }
}

export function urlHost(url: string) {
  return normalizeUrl(url)?.split("/")[0] ?? null;
}

// Its organic position (as people count it: rank_group), or null if absent.
export function positionOf(items: SerpLiveItem[], liveUrl: string) {
  const target = normalizeUrl(liveUrl);
  const match = items.find(
    (item) =>
      item.type === "organic" &&
      item.url != null &&
      normalizeUrl(item.url) === target,
  );
  return match ? (match.rank_group ?? match.rank_absolute ?? null) : null;
}

// A site: search for the URL returns it (or a page under it) once indexed.
export function isIndexed(items: SerpLiveItem[], liveUrl: string) {
  const target = normalizeUrl(liveUrl);
  return items.some((item) => {
    if (item.type !== "organic" || item.url == null) return false;
    const url = normalizeUrl(item.url);
    return (
      url !== null &&
      target !== null &&
      (url === target || url.startsWith(`${target}/`))
    );
  });
}

// The site: query for a URL: host and path, without the scheme.
export function siteQuery(liveUrl: string) {
  return `site:${normalizeUrl(liveUrl) ?? liveUrl}`;
}

export function isCited(sourceUrls: string[], liveUrl: string) {
  const target = normalizeUrl(liveUrl);
  return (
    target !== null && sourceUrls.some((url) => normalizeUrl(url) === target)
  );
}
