/**
 * Shared types for the site audit system.
 */

import { z } from "zod";
import { MIN_AUDIT_PAGES, PAID_MAX_AUDIT_PAGES } from "@/shared/audit-limits";
import { jsonCodec } from "@/shared/json";

export type LighthouseStrategy = "auto" | "none";

export interface AuditConfig {
  maxPages: number;
  lighthouseStrategy: LighthouseStrategy;
}

// Read-side only (writes stringify a typed AuditConfig). Stored rows may hold
// retired strategies ("all", "manual") from older audits; map them onto the
// closest surviving strategy — and fall back to "auto" on anything unknown —
// instead of failing the whole config parse and making the audit's results
// unviewable.
const lighthouseStrategySchema = z
  .enum(["auto", "all", "manual", "none"])
  .transform(
    (value): LighthouseStrategy =>
      value === "all" ? "auto" : value === "manual" ? "none" : value,
  )
  .catch("auto");

const auditConfigSchema = z.object({
  maxPages: z.number().int().min(MIN_AUDIT_PAGES).max(PAID_MAX_AUDIT_PAGES),
  lighthouseStrategy: lighthouseStrategySchema,
});

const auditConfigCodec = jsonCodec(auditConfigSchema);

export function parseAuditConfig(configRaw: string | null): AuditConfig | null {
  if (!configRaw) return null;
  const result = auditConfigCodec.safeParse(configRaw);
  return result.success ? result.data : null;
}

/** How a page fetch resolved. "blocked" = WAF/bot challenge stood in the way. */
export type PageFetchClass = "ok" | "blocked" | "error";

/** One outgoing link edge, deduped by target URL within a page. */
export interface PageLink {
  targetUrl: string;
  anchor: string | null;
  isInternal: boolean;
  isNofollow: boolean;
}

/** Data extracted from a single page via cheerio. */
export interface PageAnalysis {
  url: string;
  statusCode: number;
  redirectUrl: string | null;
  responseTimeMs: number;

  // Head metadata
  title: string;
  metaDescription: string;
  canonical: string | null;
  robotsMeta: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;

  // Headings
  h1s: string[];
  headingOrder: number[];

  // Content
  wordCount: number;
  bodyText: string;

  // Images
  images: Array<{ src: string | null; alt: string | null }>;

  // Links (normalized, deduped by target)
  links: PageLink[];

  // Structured data
  hasStructuredData: boolean;
  structuredData: PageStructuredData | null;

  // Hreflang
  hreflangTags: string[];
}

/**
 * What a page's JSON-LD validation leaves behind for the issue reporters.
 *
 * A projection, not the full `ValidationResult`: only the counters are
 * persisted (spec 0012), and the reporters only need enough to write a useful
 * issue detail. Broken markup and rich-result ineligibility are kept apart
 * because they are different problems with different severities — one is a
 * defect, the other is an incomplete opportunity.
 */
export interface PageStructuredData {
  /** `ld+json` blocks found on the page. */
  blockCount: number;
  /** Schema.org types found, first-seen order. */
  types: string[];
  /** Parse and vocabulary errors: markup that is broken. */
  errorCount: number;
  warningCount: number;
  /** Messages for those errors, capped for the issue detail. */
  errorMessages: string[];
  /** Features whose required properties are unmet. */
  ineligibleFeatures: Array<{
    feature: string;
    missing: string[];
    docsUrl: string;
  }>;
}

/** Lighthouse result for a single URL+strategy. */
export interface LighthouseResult {
  url: string;
  pageId: string;
  strategy: "mobile" | "desktop";
  performanceScore: number | null;
  accessibilityScore: number | null;
  bestPracticesScore: number | null;
  seoScore: number | null;
  lcpMs: number | null;
  cls: number | null;
  inpMs: number | null;
  ttfbMs: number | null;
  errorMessage?: string | null;
  r2Key?: string | null;
  payloadSizeBytes?: number | null;
}

/**
 * Full result of crawling one page. Persisted to D1 inside the crawl-batch
 * step; never accumulated in memory or returned as durable step state.
 */
export interface CrawledPageResult {
  id: string;
  url: string;
  statusCode: number;
  fetchClass: PageFetchClass;
  redirectUrl: string | null;
  title: string;
  metaDescription: string;
  canonicalUrl: string | null;
  robotsMeta: string | null;
  xRobotsTag: string | null;
  headerCanonicalUrl: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  h1Count: number;
  h2Count: number;
  h3Count: number;
  h4Count: number;
  h5Count: number;
  h6Count: number;
  headingOrder: number[];
  wordCount: number;
  contentHash: string | null;
  /**
   * True when an HTML document was fetched and analyzed. Gates the content
   * checks in page reporters (an empty-shell HTML page must still be
   * checked; a PDF must not). Transient — not persisted.
   */
  isHtml: boolean;
  imagesTotal: number;
  imagesMissingAlt: number;
  images: Array<{ src: string | null; alt: string | null }>;
  links: PageLink[];
  hasStructuredData: boolean;
  /**
   * JSON-LD validation for this page. Transient — only the two counters reach
   * D1; the messages exist so the issue reporters can name what is wrong.
   */
  structuredData: PageStructuredData | null;
  hreflangTags: string[];
  isIndexable: boolean;
  responseTimeMs: number;
  /** null = not reached via links (e.g. sitemap-seeded). */
  crawlDepth: number | null;
  inSitemap: boolean;
}

/**
 * Slim per-page summary returned as durable step state from a crawl batch.
 * Keep this small: full page data lives in D1, not in Workflow step state.
 */
export interface StepPageSummary {
  id: string;
  url: string;
  statusCode: number;
  fetchClass: PageFetchClass;
  redirectUrl: string | null;
  title: string;
  /** Normalized same-origin link targets, for frontier expansion. */
  internalLinks: string[];
}
