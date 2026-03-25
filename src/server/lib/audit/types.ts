/**
 * Shared types for the site audit system.
 */

import { z } from "zod";
import { jsonCodec } from "@/shared/json";

export type LighthouseStrategy = "auto" | "all" | "manual" | "none";

export interface AuditConfig {
  maxPages: number;
  lighthouseStrategy: LighthouseStrategy;
}

const auditConfigSchema = z.object({
  maxPages: z.number().int().min(10).max(10_000),
  lighthouseStrategy: z.enum(["auto", "all", "manual", "none"]),
});

const auditConfigCodec = jsonCodec(auditConfigSchema);

export function parseAuditConfig(configRaw: string | null): AuditConfig | null {
  if (!configRaw) return null;
  const result = auditConfigCodec.safeParse(configRaw);
  return result.success ? result.data : null;
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

export interface StepPageResult {
  id: string;
  url: string;
  statusCode: number;
  redirectUrl: string | null;
  title: string;
  metaDescription: string;
  canonicalUrl: string | null;
  robotsMeta: string | null;
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
  imagesTotal: number;
  imagesMissingAlt: number;
  images: Array<{ src: string | null; alt: string | null }>;
  internalLinks: string[];
  externalLinks: string[];
  hasStructuredData: boolean;
  hreflangTags: string[];
  isIndexable: boolean;
  responseTimeMs: number;
}
