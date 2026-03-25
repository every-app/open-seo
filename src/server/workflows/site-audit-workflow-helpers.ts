import { analyzeHtml } from "@/server/lib/audit/page-analyzer";
import type { StepPageResult } from "@/server/lib/audit/types";
import { isSameOrigin, normalizeUrl } from "@/server/lib/audit/url-utils";

export async function crawlPage(
  url: string,
  crawlOrigin: string,
): Promise<StepPageResult | null> {
  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "OpenSEO-Audit/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });

    const responseTimeMs = Date.now() - startTime;
    const statusCode = response.status;
    const finalUrl = normalizeUrl(response.url) ?? response.url;
    if (!isSameOrigin(finalUrl, crawlOrigin)) return null;

    const redirectUrl =
      response.redirected && response.url !== url ? response.url : null;
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return emptyPageResult(finalUrl, statusCode, redirectUrl, responseTimeMs);
    }

    const html = await response.text();
    const analysis = analyzeHtml(
      html,
      finalUrl,
      statusCode,
      responseTimeMs,
      redirectUrl,
    );
    const isIndexable = !(
      analysis.robotsMeta?.toLowerCase().includes("noindex") ?? false
    );
    const h2Count = analysis.headingOrder.filter((h) => h === 2).length;
    const h3Count = analysis.headingOrder.filter((h) => h === 3).length;
    const h4Count = analysis.headingOrder.filter((h) => h === 4).length;
    const h5Count = analysis.headingOrder.filter((h) => h === 5).length;
    const h6Count = analysis.headingOrder.filter((h) => h === 6).length;

    return {
      id: crypto.randomUUID(),
      url: finalUrl,
      statusCode,
      redirectUrl,
      title: analysis.title,
      metaDescription: analysis.metaDescription,
      canonicalUrl: analysis.canonical,
      robotsMeta: analysis.robotsMeta,
      ogTitle: analysis.ogTitle,
      ogDescription: analysis.ogDescription,
      ogImage: analysis.ogImage,
      h1Count: analysis.h1s.length,
      h2Count,
      h3Count,
      h4Count,
      h5Count,
      h6Count,
      headingOrder: analysis.headingOrder,
      wordCount: analysis.wordCount,
      imagesTotal: analysis.images.length,
      imagesMissingAlt: analysis.images.filter(
        (img) => !img.alt || img.alt === "",
      ).length,
      images: analysis.images,
      internalLinks: analysis.internalLinks,
      externalLinks: analysis.externalLinks,
      hasStructuredData: analysis.hasStructuredData,
      hreflangTags: analysis.hreflangTags,
      isIndexable,
      responseTimeMs,
    };
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    console.warn(`Failed to crawl ${url}:`, error);
    return emptyPageResult(url, 0, null, responseTimeMs);
  }
}

function emptyPageResult(
  url: string,
  statusCode: number,
  redirectUrl: string | null,
  responseTimeMs: number,
): StepPageResult {
  return {
    id: crypto.randomUUID(),
    url,
    statusCode,
    redirectUrl,
    title: "",
    metaDescription: "",
    canonicalUrl: null,
    robotsMeta: null,
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
    imagesTotal: 0,
    imagesMissingAlt: 0,
    images: [],
    internalLinks: [],
    externalLinks: [],
    hasStructuredData: false,
    hreflangTags: [],
    isIndexable: false,
    responseTimeMs,
  };
}
