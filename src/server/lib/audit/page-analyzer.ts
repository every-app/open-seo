/**
 * HTML page analyzer using cheerio.
 *
 * Extracts SEO-relevant data from a page's HTML:
 * title, meta description, headings, images, links, canonical, OG tags,
 * structured data, robots meta, word count, hreflang.
 */
import * as cheerio from "cheerio";
import { normalizeUrl, isSameOrigin } from "./url-utils";
import type { PageAnalysis } from "./types";

/**
 * Analyze an HTML string and extract all SEO-relevant data.
 */
export function analyzeHtml(
  html: string,
  pageUrl: string,
  statusCode: number,
  responseTimeMs: number,
  redirectUrl: string | null = null,
): PageAnalysis {
  const $ = cheerio.load(html);

  // --- Title ---
  const title = $("title").first().text().trim();

  // --- Meta description ---
  const metaDescription =
    $('meta[name="description"]').first().attr("content")?.trim() ?? "";

  // --- Canonical ---
  const canonical = $('link[rel="canonical"]').first().attr("href") ?? null;

  // --- Robots meta ---
  const robotsMeta = $('meta[name="robots"]').first().attr("content") ?? null;

  // --- Open Graph ---
  const ogTitle =
    $('meta[property="og:title"]').first().attr("content") ?? null;
  const ogDescription =
    $('meta[property="og:description"]').first().attr("content") ?? null;
  const ogImage =
    $('meta[property="og:image"]').first().attr("content") ?? null;

  // --- Headings ---
  const h1s: string[] = [];
  $("h1").each((_, el) => {
    h1s.push($(el).text().trim());
  });

  const headingOrder: number[] = [];
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    const tag =
      "tagName" in el && typeof el.tagName === "string"
        ? el.tagName.toLowerCase()
        : null;
    if (tag) {
      const level = parseInt(tag.charAt(1), 10);
      if (!isNaN(level)) headingOrder.push(level);
    }
  });

  // --- Word count (visible text in body) ---
  // Remove script/style/noscript tags, then count words in remaining text
  const bodyClone = $("body").clone();
  bodyClone.find("script, style, noscript, svg").remove();
  const bodyText = bodyClone.text().replace(/\s+/g, " ").trim();
  const wordCount = bodyText ? bodyText.split(/\s+/).length : 0;

  // --- Images ---
  const images: Array<{ src: string | null; alt: string | null }> = [];
  $("img").each((_, el) => {
    images.push({
      src: $(el).attr("src") ?? null,
      alt: $(el).attr("alt") ?? null,
    });
  });

  // --- Links ---
  const internalLinks: string[] = [];
  const externalLinks: string[] = [];

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;

    // Skip javascript:, mailto:, tel:, #anchors
    if (/^(javascript:|mailto:|tel:|#)/.test(href)) return;

    const resolved = normalizeUrl(href, pageUrl);
    if (!resolved) return;

    if (isSameOrigin(resolved, pageUrl)) {
      internalLinks.push(resolved);
    } else {
      externalLinks.push(resolved);
    }
  });

  // --- Structured data (JSON-LD) ---
  let hasStructuredData = false;
  $('script[type="application/ld+json"]').each(() => {
    hasStructuredData = true;
  });

  // --- Hreflang ---
  const hreflangTags: string[] = [];
  $('link[rel="alternate"][hreflang]').each((_, el) => {
    const hreflang = $(el).attr("hreflang");
    if (hreflang) hreflangTags.push(hreflang);
  });

  return {
    url: pageUrl,
    statusCode,
    redirectUrl,
    responseTimeMs,
    title,
    metaDescription,
    canonical,
    robotsMeta,
    ogTitle,
    ogDescription,
    ogImage,
    h1s,
    headingOrder,
    wordCount,
    images,
    internalLinks,
    externalLinks,
    hasStructuredData,
    hreflangTags,
  };
}
