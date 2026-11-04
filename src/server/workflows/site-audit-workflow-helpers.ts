import { fetchAuditPage } from "./auditPageFetch";
import { MAX_HTML_BYTES, readTextUpTo } from "@/server/lib/audit/html-response";
import { classifyFetch } from "@/server/lib/audit/classify-fetch";
import type { CrawledPageResult } from "@/server/lib/audit/types";
import type { RenderedPage } from "@/server/lib/audit/rendered-page";
import type { PageFetchClass } from "@/shared/audit-fetch-class";
import { sha256Hex } from "@/server/lib/audit/ids";
import { normalizeUrl } from "@/server/lib/audit/url-utils";
import type { CrawlThrottle } from "@/server/lib/audit/crawl-throttle";
import { crawlerHeadersFor, type CrawlerAccess } from "@/shared/crawler-access";
import type { AuditFetchDiagnostics } from "@/server/lib/audit/fetch-diagnostics";

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
      return normalizeUrl(match[1].trim(), pageUrl, {
        keepTrackingParams: true,
      });
    }
  }
  return null;
}

/** Null leaves this URL deferred when the shared cooldown stops its fetch. */
export async function crawlPage(
  url: string,
  crawlDepth: number | null,
  inSitemap: boolean,
  throttle: CrawlThrottle,
  options: {
    /** Crawler-access headers for the audited host, when the org has one. */
    access?: CrawlerAccess | null;
    render?: (url: string) => Promise<RenderedPage>;
    /** Correlates safe fetch diagnostics with one audit in Workers logs. */
    auditId?: string;
    /** Bounded signed-audit request timeline. */
    diagnostics?: AuditFetchDiagnostics;
    renderThrottled?: boolean;
  } = {},
): Promise<CrawledPageResult | null> {
  const { access, render, auditId, diagnostics } = options;
  const renderThrottled = Boolean(render && options.renderThrottled);
  const startTime = Date.now();
  // Calculate once for this request, so the boolean we log describes the
  // exact header set passed to fetch without ever retaining its values.
  const crawlerHeaders = crawlerHeadersFor(url, access);
  const signatureAttached = Object.hasOwn(crawlerHeaders, "Signature");
  let statusCode: number | null = null;
  let retryAfter: string | null = null;
  let renderAttempted = false;
  let renderingFailed = false;

  try {
    const fetched = await fetchAuditPage(
      url,
      throttle,
      access,
      diagnostics,
      renderThrottled,
    );
    if (!fetched) return null;
    const { response, responseTimeMs, rateLimited } = fetched;
    statusCode = response.status;
    retryAfter = response.headers.get("retry-after");
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
    let isHtml = contentType.includes("text/html");
    // Cap what we read: the first 1 MiB still contains the SEO metadata and
    // navigation needed by the audit in normal documents.
    let body = isHtml ? await readTextUpTo(response, MAX_HTML_BYTES) : "";
    let fetchClass = classifyFetch(
      statusCode,
      Boolean(response.headers.get("cf-mitigated")),
      body.slice(0, 4_000),
    );

    // Rendering replaces the body of a readable HTML page, a bot challenge, or
    // a throttled Shopify page with what the browser loaded. A block can be
    // any content type: a host's firewall need not answer with HTML. Redirects,
    // non-HTML files, origin errors, login walls and other rate limits keep
    // their existing paths. The direct response's timing and headers stay
    // authoritative.
    const challenged = fetchClass === "blocked" && statusCode !== 401;
    const throttled = renderThrottled && statusCode === 429;
    if (
      render &&
      (throttled ||
        challenged ||
        (isHtml && fetchClass === "ok" && statusCode < 400))
    ) {
      // Nothing reads a non-HTML refusal, and a render can take many seconds.
      if (!isHtml) await response.body?.cancel();
      try {
        renderAttempted = true;
        const page = await render(url);
        body = page.html;
        isHtml = true;
        // A challenge's or a 429's status was never the page's. Browser Run
        // reports the status it loaded; Context returns only pages that loaded.
        if (challenged || throttled) statusCode = page.status ?? 200;
        // The renderer can be challenged where the direct fetch was not.
        fetchClass = classifyFetch(statusCode, false, body.slice(0, 4_000));
      } catch {
        if (throttled) {
          await throttle.refuse(url, response.headers.get("retry-after"));
        } else if (!challenged) {
          // Preserve readable initial HTML when optional rendering fails.
          renderingFailed = true;
          logCrawlFailure({
            auditId,
            url,
            statusCode,
            signatureAttached,
            retryAfter,
            redirectOutcome: "not_followed",
            errorCategory: "render_failed",
          });
        }
      }
    }

    if (!isHtml || fetchClass !== "ok" || statusCode >= 400) {
      if (fetchClass !== "ok" || statusCode >= 400) {
        logCrawlFailure({
          auditId,
          url,
          statusCode,
          signatureAttached,
          retryAfter,
          redirectOutcome: "not_followed",
          errorCategory:
            fetchClass === "rate_limited"
              ? "rate_limited"
              : fetchClass === "blocked"
                ? "blocked_response"
                : "http_response",
        });
      }
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
    // Rendered HTML can still be the loading shell (a weak render), so the
    // same check applies whether or not the page was rendered.
    const javascriptShell = analysis.javascriptShell === true;
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
        ? (normalizeUrl(analysis.canonical, url, {
            keepTrackingParams: true,
          }) ?? analysis.canonical)
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
      contentHash:
        analysis.bodyText && !javascriptShell
          ? await sha256Hex(analysis.bodyText)
          : null,
      isHtml: true,
      javascriptShell,
      htmlBytes: body.length,
      renderingFailed,
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
    logCrawlFailure({
      auditId,
      url,
      statusCode,
      signatureAttached,
      retryAfter,
      redirectOutcome: "unknown",
      errorCategory: renderAttempted
        ? "render_failed"
        : classifyCrawlError(error),
    });
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

type CrawlFailureDiagnostic = {
  auditId: string | undefined;
  url: string;
  statusCode: number | null;
  signatureAttached: boolean;
  retryAfter: string | null;
  redirectOutcome: "not_followed" | "unknown";
  errorCategory:
    | "blocked_response"
    | "http_response"
    | "network"
    | "other"
    | "rate_limited"
    | "render_failed"
    | "timeout";
};

/**
 * Safe enough for production logs: it intentionally excludes URLs beyond the
 * hostname, headers, signature values, response bodies, and raw exceptions.
 */
function logCrawlFailure(diagnostic: CrawlFailureDiagnostic) {
  if (!diagnostic.auditId) return;
  console.warn("site_audit:fetch_failure", {
    auditId: diagnostic.auditId,
    hostname: new URL(diagnostic.url).hostname,
    status: diagnostic.statusCode,
    signatureAttached: diagnostic.signatureAttached,
    redirectOutcome: diagnostic.redirectOutcome,
    retryAfter: diagnostic.retryAfter,
    errorCategory: diagnostic.errorCategory,
  });
}

function classifyCrawlError(error: unknown): "network" | "other" | "timeout" {
  if (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return "timeout";
  }
  return error instanceof TypeError ? "network" : "other";
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
