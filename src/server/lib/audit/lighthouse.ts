import { detectUrlTemplate } from "./url-utils";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseoClient";
import type { LighthouseResult, LighthouseStrategy } from "./types";
import { putTextToR2 } from "@/server/lib/r2";

interface LighthouseSamplePage {
  url: string;
  statusCode: number;
}

type LighthouseFetchResult = {
  result: LighthouseResult;
  payloadJson: string | null;
};

async function fetchLighthouseResult(
  url: string,
  pageId: string,
  strategy: "mobile" | "desktop",
  billingCustomer: BillingCustomerContext,
): Promise<LighthouseFetchResult> {
  let lastError: Error | null = null;
  const dataforseo = createDataforseoClient(billingCustomer);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) {
        // Exponential backoff: 2s, 4s
        await new Promise((resolve) =>
          setTimeout(resolve, 2000 * Math.pow(2, attempt - 1)),
        );
      }

      const data = await dataforseo.lighthouse.live({ url, strategy });

      return {
        result: {
          url,
          pageId,
          strategy,
          performanceScore: data.scores.performance,
          accessibilityScore: data.scores.accessibility,
          bestPracticesScore: data.scores["best-practices"],
          seoScore: data.scores.seo,
          lcpMs: data.metrics.largestContentfulPaint.numericValue,
          cls: data.metrics.cumulativeLayoutShift.numericValue,
          inpMs: data.metrics.interactionToNextPaint.numericValue,
          ttfbMs: data.metrics.serverResponseTime.numericValue,
        },
        payloadJson: JSON.stringify(data),
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(
        `Lighthouse attempt ${attempt + 1} failed for ${url}:`,
        lastError.message,
      );
    }
  }

  // All retries exhausted — return null scores
  console.error(
    `Lighthouse failed after 3 attempts for ${url}:`,
    lastError?.message,
  );
  return {
    result: {
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
      errorMessage: lastError?.message ?? "Lighthouse request failed",
    },
    payloadJson: null,
  };
}

export async function fetchAndStoreLighthouseResult(input: {
  url: string;
  pageId: string;
  strategy: "mobile" | "desktop";
  billingCustomer: BillingCustomerContext;
  projectId: string;
  auditId: string;
}): Promise<LighthouseResult> {
  const fetched = await fetchLighthouseResult(
    input.url,
    input.pageId,
    input.strategy,
    input.billingCustomer,
  );

  if (!fetched.payloadJson) {
    return fetched.result;
  }

  const key = `site-audit/${input.projectId}/${input.auditId}/${input.pageId}-${input.strategy}.json`;
  const uploaded = await putTextToR2(key, fetched.payloadJson);

  return {
    ...fetched.result,
    r2Key: uploaded.key,
    payloadSizeBytes: uploaded.sizeBytes,
  };
}

/**
 * Select which pages to run Lighthouse on, based on the chosen strategy.
 */
export function selectLighthouseSample(
  pages: LighthouseSamplePage[],
  startUrl: string,
  strategy: LighthouseStrategy,
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
  const templateGroups = new Map<string, LighthouseSamplePage>();
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
