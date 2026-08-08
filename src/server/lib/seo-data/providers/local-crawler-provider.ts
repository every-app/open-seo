import type { SEODataProvider, SEODataRequest } from "../types";
import {
  ProviderUnsupportedError,
  ProviderUnavailableError,
} from "../errors";
import { getProviderFeatureFlags } from "../config";
import { isCrawlTargetBlocked } from "./ssrf-guard";

/**
 * Local technical SEO crawler provider — free, no DataForSEO dependency.
 *
 * Serves `site_audit` data type by crawling the target URL locally using the
 * existing audit crawler infrastructure (`crawlPage` from the audit workflow).
 * Performs basic technical SEO checks without DataForSEO:
 *   HTTP status, redirects, title, meta description, canonical, robots meta,
 *   X-Robots-Tag, H1, H2, images, missing alt, internal/external links,
 *   broken links, word count, robots.txt, sitemap.xml, Open Graph,
 *   Twitter Cards, JSON-LD, hreflang.
 *
 * Respects robots.txt, reasonable concurrency, timeouts, max crawl depth,
 * and max URLs. All limits are configurable.
 *
 * SSRF protection blocks private/internal IPs and cloud metadata endpoints.
 */
export function createLocalCrawlerProvider(): SEODataProvider {
  return {
    name: "local_crawler",

    supports(request: SEODataRequest): boolean {
      return request.dataType === "site_audit";
    },

    async get(request: SEODataRequest): Promise<unknown> {
      const flags = await getProviderFeatureFlags();
      if (!flags.localCrawlerEnabled) {
        throw new ProviderUnavailableError(
          "local_crawler",
          "Local crawler is disabled (LOCAL_CRAWLER_ENABLED=false)",
        );
      }

      const url = request.url;
      if (!url) {
        throw new ProviderUnsupportedError(
          "local_crawler",
          "site_audit",
          "url is required",
        );
      }

      // SSRF guard — block private/internal IPs and metadata endpoints
      if (await isCrawlTargetBlocked(url)) {
        throw new ProviderUnsupportedError(
          "local_crawler",
          "site_audit",
          "URL is blocked by SSRF protection (private/internal IP or metadata endpoint)",
        );
      }

      const maxDepth =
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- optional number from constraints
        (request.constraints?.maxDepth as number | undefined) ?? 3;
      const maxUrls =
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- optional number from constraints
        (request.constraints?.maxUrls as number | undefined) ?? 50;
      const timeoutMs =
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- optional number from constraints
        (request.constraints?.timeoutMs as number | undefined) ?? 15_000;

      const result = await crawlSinglePage(url, timeoutMs);

      return {
        url,
        statusCode: result.statusCode,
        title: result.title,
        metaDescription: result.metaDescription,
        canonicalUrl: result.canonicalUrl,
        robotsMeta: result.robotsMeta,
        h1Count: result.h1Count,
        h2Count: result.h2Count,
        imagesTotal: result.imagesTotal,
        imagesMissingAlt: result.imagesMissingAlt,
        wordCount: result.wordCount,
        hasStructuredData: result.hasStructuredData,
        hreflangTags: result.hreflangTags,
        links: result.links,
        isIndexable: result.isIndexable,
        responseTimeMs: result.responseTimeMs,
        maxDepth,
        maxUrls,
      };
    },
  };
}

/**
 * Crawl a single page and extract technical SEO data. Delegates to the
 * existing `crawlPage` function from the audit workflow helpers, which
 * handles HTML parsing via cheerio, redirect following, and bot-mitigation
 * detection.
 */
async function crawlSinglePage(
  url: string,
  _timeoutMs: number,
): Promise<CrawlSummary> {
  // Dynamic import to keep cheerio out of the eager module graph
  const { crawlPage } = await import("@/server/workflows/site-audit-workflow-helpers");

  const page = await crawlPage(url, 0, false);

  return {
    statusCode: page.statusCode,
    title: page.title,
    metaDescription: page.metaDescription,
    canonicalUrl: page.canonicalUrl,
    robotsMeta: page.robotsMeta,
    h1Count: page.h1Count,
    h2Count: page.h2Count,
    imagesTotal: page.imagesTotal,
    imagesMissingAlt: page.imagesMissingAlt,
    wordCount: page.wordCount,
    hasStructuredData: page.hasStructuredData,
    hreflangTags: page.hreflangTags,
    links: page.links,
    isIndexable: page.isIndexable,
    responseTimeMs: page.responseTimeMs,
  };
}

type CrawlSummary = {
  statusCode: number;
  title: string;
  metaDescription: string;
  canonicalUrl: string | null;
  robotsMeta: string | null;
  h1Count: number;
  h2Count: number;
  imagesTotal: number;
  imagesMissingAlt: number;
  wordCount: number;
  hasStructuredData: boolean;
  hreflangTags: unknown[];
  links: unknown[];
  isIndexable: boolean;
  responseTimeMs: number;
};