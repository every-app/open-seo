/**
 * Shared types for the site audit system.
 */

export type PsiStrategy = "auto" | "all" | "manual" | "none";

export interface AuditConfig {
  maxPages: number;
  psiStrategy: PsiStrategy;
  psiApiKey?: string;
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

  // Images
  images: Array<{ src: string | null; alt: string | null }>;

  // Links (raw href values from the HTML)
  internalLinks: string[];
  externalLinks: string[];

  // Structured data
  hasStructuredData: boolean;

  // Hreflang
  hreflangTags: string[];
}

/** PSI result for a single URL+strategy. */
export interface PsiResult {
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
  rawPayloadJson?: string | null;
}
