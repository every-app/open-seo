import type {
  CrawledPageResult,
  PageFetchClass,
} from "@/server/lib/audit/types";
import { sha256Hex } from "@/server/lib/audit/ids";
import { normalizeUrl } from "@/server/lib/audit/url-utils";

const CRAWL_USER_AGENT = "OpenSEO-Audit/1.0";

/**
 * Markers of a bot-mitigation challenge page. We classify these honestly as
 * "blocked" instead of recording the challenge HTML as if it were the page.
 */
const CHALLENGE_BODY_MARKERS = [
  "just a moment...",
  "challenge-platform",
  "cf-browser-verification",
  "attention required! | cloudflare",
  "verifying you are human",
];

function classifyFetch(
  statusCode: number,
  headers: Headers,
  bodySnippet: string,
): PageFetchClass {
  if (statusCode === 0) return "error";
  if (headers.get("cf-mitigated")) return "blocked";
  if (statusCode === 401 || statusCode === 403 || statusCode === 429) {
    return "blocked";
  }
  if (statusCode === 503) {
    const snippet = bodySnippet.toLowerCase();
    if (CHALLENGE_BODY_MARKERS.some((marker) => snippet.includes(marker))) {
      return "blocked";
    }
  }
  return "ok";
}

/** Resolve a Location header against its base without normalizing. */
function resolveRawUrl(location: string, base: string): string | null {
  try {
    return new URL(location, base).toString();
  } catch {
    return null;
  }
}

/** Parse `Link: <url>; rel="canonical"` response headers. */
function parseLinkHeaderCanonical(
  linkHeader: string | null,
  pageUrl: string,
): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const match = part.match(/<([^>]+)>\s*;([^]*)/);
    if (!match) continue;
    if (/rel\s*=\s*"?canonical"?/i.test(match[2])) {
      return normalizeUrl(match[1].trim(), pageUrl);
    }
  }
  return null;
}

export async function crawlPage(
  url: string,
  crawlDepth: number | null,
  inSitemap: boolean,
): Promise<CrawledPageResult> {
  const startTime = Date.now();

  try {
    // Manual redirect handling: each hop is recorded as its own page row and
    // the target is enqueued by the frontier, so chains/loops are detectable.
    // Exception: redirects whose target normalizes to this same URL (e.g.
    // /docs -> /docs/ on slash-canonical sites — our normalizer strips the
    // slash) are followed inline; recording them would create self-redirect
    // rows the frontier can never resolve.
    let fetchUrl = url;
    let response: Response;
    let hops = 0;
    for (;;) {
      response = await fetch(fetchUrl, {
        headers: {
          "User-Agent": CRAWL_USER_AGENT,
          Accept: "text/html,application/xhtml+xml",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
      });

      if (response.status < 300 || response.status >= 400) break;

      const location = response.headers.get("location");
      const rawTarget = location ? resolveRawUrl(location, fetchUrl) : null;
      const normalizedTarget = location
        ? normalizeUrl(location, fetchUrl)
        : null;
      const isSelfAfterNormalization =
        normalizedTarget === url &&
        rawTarget !== null &&
        rawTarget !== fetchUrl;
      if (!isSelfAfterNormalization || hops >= 3) break;

      fetchUrl = rawTarget;
      hops += 1;
    }

    const responseTimeMs = Date.now() - startTime;
    const statusCode = response.status;
    const xRobotsTag = response.headers.get("x-robots-tag");
    const headerCanonicalUrl = parseLinkHeaderCanonical(
      response.headers.get("link"),
      fetchUrl,
    );

    if (statusCode >= 300 && statusCode < 400) {
      const location = response.headers.get("location");
      const redirectUrl = location ? normalizeUrl(location, fetchUrl) : null;
      return emptyPageResult({
        url,
        statusCode,
        fetchClass: "ok",
        redirectUrl,
        responseTimeMs,
        xRobotsTag,
        headerCanonicalUrl,
        crawlDepth,
        inSitemap,
      });
    }

    const contentType = response.headers.get("content-type") ?? "";
    const isHtml = contentType.includes("text/html");
    const body = isHtml ? await response.text() : "";
    const fetchClass = classifyFetch(
      statusCode,
      response.headers,
      body.slice(0, 4_000),
    );

    if (!isHtml || fetchClass !== "ok" || statusCode >= 400) {
      return emptyPageResult({
        url,
        statusCode,
        fetchClass,
        redirectUrl: null,
        responseTimeMs,
        xRobotsTag,
        headerCanonicalUrl,
        crawlDepth,
        inSitemap,
      });
    }

    // Resolve links/canonical against the URL that actually served the
    // content (it may carry a trailing slash the recorded URL doesn't).
    // Dynamic import keeps cheerio (page-analyzer's HTML parser) out of the
    // worker's startup module graph: SiteAuditWorkflow is re-exported from
    // src/server.ts, so a static import would evaluate cheerio in every
    // isolate's baseline heap, not just when an audit actually crawls.
    const { analyzeHtml } = await import("@/server/lib/audit/page-analyzer");
    const analysis = analyzeHtml(body, fetchUrl, statusCode, responseTimeMs);
    const robotsDirectives = [analysis.robotsMeta, xRobotsTag]
      .filter(Boolean)
      .join(",")
      .toLowerCase();
    const isIndexable = !robotsDirectives.includes("noindex");
    const headingCount = (level: number) =>
      analysis.headingOrder.filter((h) => h === level).length;

    return {
      id: crypto.randomUUID(),
      url,
      statusCode,
      fetchClass,
      redirectUrl: null,
      title: analysis.title,
      metaDescription: analysis.metaDescription,
      canonicalUrl: analysis.canonical
        ? (normalizeUrl(analysis.canonical, fetchUrl) ?? analysis.canonical)
        : null,
      robotsMeta: analysis.robotsMeta,
      xRobotsTag,
      headerCanonicalUrl,
      ogTitle: analysis.ogTitle,
      ogDescription: analysis.ogDescription,
      ogImage: analysis.ogImage,
      h1Count: analysis.h1s.length,
      h2Count: headingCount(2),
      h3Count: headingCount(3),
      h4Count: headingCount(4),
      h5Count: headingCount(5),
      h6Count: headingCount(6),
      headingOrder: analysis.headingOrder,
      wordCount: analysis.wordCount,
      contentHash: analysis.bodyText
        ? await sha256Hex(analysis.bodyText)
        : null,
      isHtml: true,
      imagesTotal: analysis.images.length,
      // Only a truly absent alt attribute counts: alt="" is the correct
      // markup for decorative images.
      imagesMissingAlt: analysis.images.filter((img) => img.alt === null)
        .length,
      images: analysis.images,
      links: analysis.links,
      hasStructuredData: analysis.hasStructuredData,
      hreflangTags: analysis.hreflangTags,
      isIndexable,
      responseTimeMs,
      crawlDepth,
      inSitemap,
    };
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    console.warn(`Failed to crawl ${url}:`, error);
    return emptyPageResult({
      url,
      statusCode: 0,
      fetchClass: "error",
      redirectUrl: null,
      responseTimeMs,
      xRobotsTag: null,
      headerCanonicalUrl: null,
      crawlDepth,
      inSitemap,
    });
  }
}

function emptyPageResult(input: {
  url: string;
  statusCode: number;
  fetchClass: PageFetchClass;
  redirectUrl: string | null;
  responseTimeMs: number;
  xRobotsTag: string | null;
  headerCanonicalUrl: string | null;
  crawlDepth: number | null;
  inSitemap: boolean;
}): CrawledPageResult {
  return {
    id: crypto.randomUUID(),
    url: input.url,
    statusCode: input.statusCode,
    fetchClass: input.fetchClass,
    redirectUrl: input.redirectUrl,
    title: "",
    metaDescription: "",
    canonicalUrl: null,
    robotsMeta: null,
    xRobotsTag: input.xRobotsTag,
    headerCanonicalUrl: input.headerCanonicalUrl,
    ogTitle: null,
    ogDescription: null,
    ogImage: null,
    h1Count: 0,
    h2Count: 0,
    h3Count: 0,
    h4Count: 0,
    h5Count: 0,
    h6Count: 0,
    headingOrder: [],
    wordCount: 0,
    contentHash: null,
    isHtml: false,
    imagesTotal: 0,
    imagesMissingAlt: 0,
    images: [],
    links: [],
    hasStructuredData: false,
    hreflangTags: [],
    isIndexable: false,
    responseTimeMs: input.responseTimeMs,
    crawlDepth: input.crawlDepth,
    inSitemap: input.inSitemap,
  };
}
