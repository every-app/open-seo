import { brand } from "@/shared/brand";
import type { CrawledPageResult } from "@/server/lib/audit/types";
import type { PageFetchClass } from "@/shared/audit-fetch-class";
import { sha256Hex } from "@/server/lib/audit/ids";
import { normalizeUrl } from "@/server/lib/audit/url-utils";
import type { CrawlThrottle } from "@/server/lib/audit/crawl-throttle";

const CRAWL_USER_AGENT = brand.userAgent;
const MAX_HTML_BYTES = 1024 * 1024;

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
  // A final 429 means rate limiting, whether retries were exhausted or the
  // requested cooldown exceeded the crawl budget. Checked before
  // cf-mitigated: a Cloudflare rate-limiting rule sets that header too.
  if (statusCode === 429) return "rate_limited";
  if (headers.get("cf-mitigated")) return "blocked";
  if (statusCode === 401 || statusCode === 403) return "blocked";
  if (statusCode === 503) {
    const snippet = bodySnippet.toLowerCase();
    if (CHALLENGE_BODY_MARKERS.some((marker) => snippet.includes(marker))) {
      return "blocked";
    }
  }
  return "ok";
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

/**
 * Fetch one URL, pausing the whole chunk and retrying while the site 429s
 * (see crawl-throttle.ts). `responseTimeMs` is measured from the last attempt
 * so backoff waiting never looks like a slow server.
 */
async function fetchPage(url: string, throttle: CrawlThrottle) {
  for (let attempt = 1; ; attempt++) {
    if (!(await throttle.ready())) return null;
    const startedAt = Date.now();
    // Manual redirect handling: each hop is recorded as its own page row and
    // its target is enqueued by the frontier, so redirect chains and loops are
    // detectable from the recorded rows. Trailing-slash redirects (/docs ->
    // /docs/) need no special handling: normalizeUrl preserves trailing
    // slashes, so /docs and /docs/ are distinct URLs and the redirect resolves
    // to its canonical target instead of cycling back to its own source.
    const response = await fetch(url, {
      headers: {
        "User-Agent": CRAWL_USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    const result = {
      response,
      responseTimeMs: Date.now() - startedAt,
      // A retry means an earlier attempt was 429'd; a 429 handed back after
      // the last retry is already classified rate_limited and needs no flag.
      rateLimited: attempt > 1,
    };
    if (response.status !== 429) {
      await throttle.recovered();
      return result;
    }

    const retry = await throttle.backoff(
      attempt,
      response.headers.get("retry-after"),
    );
    // The shared cooldown applies even when this URL has no retries left.
    if (!retry) return result;
    await response.body?.cancel();
  }
}

/** Null leaves this URL deferred when the shared cooldown stops its fetch. */
export async function crawlPage(
  url: string,
  crawlDepth: number | null,
  inSitemap: boolean,
  throttle: CrawlThrottle,
): Promise<CrawledPageResult | null> {
  const startTime = Date.now();

  try {
    const fetched = await fetchPage(url, throttle);
    if (!fetched) return null;
    const { response, responseTimeMs, rateLimited } = fetched;
    const statusCode = response.status;
    const xRobotsTag = response.headers.get("x-robots-tag");
    const headerCanonicalUrl = parseLinkHeaderCanonical(
      response.headers.get("link"),
      url,
    );

    if (statusCode >= 300 && statusCode < 400) {
      const location = response.headers.get("location");
      const redirectUrl = location ? normalizeUrl(location, url) : null;
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
        rateLimited,
      });
    }

    const contentType = response.headers.get("content-type") ?? "";
    const isHtml = contentType.includes("text/html");
    // Cap what we read: the first 1 MiB still contains the SEO metadata and
    // navigation needed by the audit in normal documents.
    const body = isHtml ? await readTextUpTo(response, MAX_HTML_BYTES) : "";
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
        // The body was still fetched and buffered; report its size so the
        // crawl window's byte budget sees blocked/error pages too.
        htmlBytes: body.length,
        rateLimited,
      });
    }

    // Dynamic import keeps the HTML parser out of the worker's startup
    // module graph: SiteAuditWorkflow is re-exported from src/server.ts, so
    // a static import would evaluate it in every isolate's baseline heap,
    // not just when an audit actually crawls.
    const { analyzeHtml } = await import("@/server/lib/audit/page-analyzer");
    const analysis = analyzeHtml(body, url, statusCode, responseTimeMs);
    const robotsDirectives = [analysis.robotsMeta, xRobotsTag]
      .filter(Boolean)
      .join(",")
      .toLowerCase();
    const isIndexable = !robotsDirectives.includes("noindex");
    const headingCount = (level: number) =>
      analysis.headingOrder.filter((h) => h === level).length;

    // Parser strings can be V8 slices backed by the entire HTML body. Detach
    // the finished result before persistence queues retain it: otherwise a
    // few KB of metadata can keep ~2 MiB of decoded HTML alive per page.
    return structuredClone({
      id: crypto.randomUUID(),
      url,
      statusCode,
      fetchClass,
      redirectUrl: null,
      title: analysis.title,
      metaDescription: analysis.metaDescription,
      canonicalUrl: analysis.canonical
        ? (normalizeUrl(analysis.canonical, url) ?? analysis.canonical)
        : null,
      robotsMeta: analysis.robotsMeta,
      xRobotsTag,
      headerCanonicalUrl,
      ogTitle: analysis.ogTitle,
      ogDescription: analysis.ogDescription,
      ogImage: analysis.ogImage,
      h1Count: analysis.h1s.filter((h) => h.length > 0).length,
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
      htmlBytes: body.length,
      rateLimited,
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
    });
  } catch (error) {
    // Losing a durable cooldown must fail the workflow, not become a page
    // error that lets the scheduler continue making requests.
    if (throttle.checkpointFailed) throw error;
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

async function readTextUpTo(response: Response, maxBytes: number) {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parts: string[] = [];
  let bytesRead = 0;

  try {
    while (bytesRead < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;

      const remaining = maxBytes - bytesRead;
      const chunk =
        value.byteLength > remaining ? value.subarray(0, remaining) : value;
      bytesRead += chunk.byteLength;
      parts.push(decoder.decode(chunk, { stream: true }));

      if (bytesRead >= maxBytes) {
        await reader.cancel();
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }

  parts.push(decoder.decode());
  return parts.join("");
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
  htmlBytes?: number;
  rateLimited?: boolean;
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
    htmlBytes: input.htmlBytes ?? 0,
    rateLimited: input.rateLimited ?? false,
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
