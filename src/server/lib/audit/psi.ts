/**
 * Google PageSpeed Insights (PSI) API client and sampling logic.
 */
import { detectUrlTemplate } from "./url-utils";
import type { PsiResult, PsiStrategy } from "./types";

interface PsiSamplePage {
  url: string;
  statusCode: number;
}

const PSI_API_URL =
  "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

/**
 * Fetch PageSpeed Insights results for a single URL.
 * Retries up to 3 times with exponential backoff.
 */
export async function fetchPsiResult(
  url: string,
  pageId: string,
  strategy: "mobile" | "desktop",
  apiKey: string,
): Promise<PsiResult> {
  // Build URL with multiple category params (PSI API allows repeated 'category')
  const apiUrl = `${PSI_API_URL}?url=${encodeURIComponent(url)}&strategy=${strategy}&key=${encodeURIComponent(apiKey)}&category=performance&category=accessibility&category=best-practices&category=seo`;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) {
        // Exponential backoff: 2s, 4s
        await new Promise((resolve) =>
          setTimeout(resolve, 2000 * Math.pow(2, attempt - 1)),
        );
      }

      const response = await fetch(apiUrl, {
        signal: AbortSignal.timeout(60_000), // PSI can be slow
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`PSI API ${response.status}: ${text.slice(0, 200)}`);
      }

      const data: PsiApiResponse = await response.json();

      return parsePsiResponse(data, url, pageId, strategy);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(
        `PSI attempt ${attempt + 1} failed for ${url}:`,
        lastError.message,
      );
    }
  }

  // All retries exhausted — return null scores
  console.error(`PSI failed after 3 attempts for ${url}:`, lastError?.message);
  return {
    url,
    pageId,
    strategy,
    performanceScore: null,
    accessibilityScore: null,
    bestPracticesScore: null,
    seoScore: null,
    lcpMs: null,
    cls: null,
    inpMs: null,
    ttfbMs: null,
    errorMessage: lastError?.message ?? "PSI request failed",
  };
}

/**
 * Select which pages to run PSI on, based on the chosen strategy.
 */
export function selectPsiSample(
  pages: PsiSamplePage[],
  startUrl: string,
  strategy: PsiStrategy,
): string[] {
  if (strategy === "none") return [];

  // Only consider pages that loaded successfully
  const validPages = pages.filter(
    (p) => p.statusCode >= 200 && p.statusCode < 300,
  );

  if (strategy === "all") {
    return validPages.map((p) => p.url);
  }

  if (strategy === "manual") {
    // manual = user picks after crawl; for now return empty
    return [];
  }

  // strategy === "auto": homepage + 1 per URL pattern, capped at 10
  const selected = new Set<string>();

  // Always include the start URL / homepage
  const startPage = validPages.find((p) => p.url === startUrl);
  if (startPage) selected.add(startPage.url);

  // Group by URL template pattern
  const templateGroups = new Map<string, PsiSamplePage>();
  for (const page of validPages) {
    if (selected.has(page.url)) continue;
    const template = detectUrlTemplate(new URL(page.url).pathname);
    if (!templateGroups.has(template)) {
      templateGroups.set(template, page);
    }
  }

  // Add one page per template group
  for (const [, page] of templateGroups) {
    if (selected.size >= 10) break;
    selected.add(page.url);
  }

  return Array.from(selected);
}

// ─── PSI API Response Types ──────────────────────────────────────────────────

interface PsiApiResponse {
  lighthouseResult?: {
    categories?: {
      performance?: { score?: number | null };
      accessibility?: { score?: number | null };
      "best-practices"?: { score?: number | null };
      seo?: { score?: number | null };
    };
    audits?: {
      "largest-contentful-paint"?: { numericValue?: number };
      "cumulative-layout-shift"?: { numericValue?: number };
      "interaction-to-next-paint"?: { numericValue?: number };
      "server-response-time"?: { numericValue?: number };
    };
  };
}

function parsePsiResponse(
  data: PsiApiResponse,
  url: string,
  pageId: string,
  strategy: "mobile" | "desktop",
): PsiResult {
  const categories = data.lighthouseResult?.categories;
  const audits = data.lighthouseResult?.audits;

  return {
    url,
    pageId,
    strategy,
    performanceScore: scoreToPercent(categories?.performance?.score),
    accessibilityScore: scoreToPercent(categories?.accessibility?.score),
    bestPracticesScore: scoreToPercent(categories?.["best-practices"]?.score),
    seoScore: scoreToPercent(categories?.seo?.score),
    lcpMs: audits?.["largest-contentful-paint"]?.numericValue ?? null,
    cls: audits?.["cumulative-layout-shift"]?.numericValue ?? null,
    inpMs: audits?.["interaction-to-next-paint"]?.numericValue ?? null,
    ttfbMs: audits?.["server-response-time"]?.numericValue ?? null,
    rawPayloadJson: JSON.stringify(data),
  };
}

/** PSI scores come as 0-1 floats; convert to 0-100 integers. */
function scoreToPercent(score: number | null | undefined): number | null {
  if (score == null) return null;
  return Math.round(score * 100);
}
