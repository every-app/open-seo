import { detectUrlTemplate, canonicalUrlKey } from "./url-utils";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import type { LighthouseResult, LighthouseStrategy } from "./types";
import { putTextToR2 } from "@/server/lib/r2";
import { asAppError } from "@/server/lib/errors";
import type { StoredLighthousePayload } from "@/server/lib/lighthouseStoredPayload";
import { fetchPagespeedLighthouse } from "@/server/lib/pagespeedLighthouse";

interface LighthouseSamplePage {
  url: string;
  statusCode: number;
}

function canonicalUrlKeyWithoutTrailingSlash(url: string): string {
  const parsed = new URL(canonicalUrlKey(url));
  if (parsed.pathname !== "/") {
    parsed.pathname = parsed.pathname.replace(/\/$/, "");
  }
  return parsed.toString();
}

type LighthouseFetchResult = {
  result: LighthouseResult;
  payloadJson: string | null;
};

/** A check that produced no payload — provider error, or a failed fetch step. */
export function failedLighthouseFetch(
  url: string,
  pageId: string,
  strategy: "mobile" | "desktop",
  errorMessage: string,
): LighthouseFetchResult {
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
      errorMessage,
    },
    payloadJson: null,
  };
}

export async function fetchLighthouseResult(
  url: string,
  pageId: string,
  strategy: "mobile" | "desktop",
  billingCustomer: BillingCustomerContext,
): Promise<LighthouseFetchResult> {
  const dataforseo = createDataforseoClient(billingCustomer);
  try {
    const data = await dataforseo.lighthouse.live({ url, strategy });

    return storedPayloadToFetchResult(url, pageId, strategy, data);
  } catch (error) {
    const failed = error instanceof Error ? error : new Error(String(error));
    // Lighthouse runtime errors (ERRORED_DOCUMENT_REQUEST, NOT_HTML, NO_FCP) mean the
    // tenant's page didn't load for the provider's Chrome. The failure is already
    // surfaced on the audit row, so there is nothing for us to act on.
    const log = failed.message.includes(
      "Lighthouse encountered an error with the following code",
    )
      ? console.warn
      : console.error;
    log(`Lighthouse failed for ${url} (${strategy}): ${failed.message}`);
    // DataForSEO unconfigured (or its key rejected) is a configuration gap, not
    // a broken page: fall back to the free Google PageSpeed Insights API, which
    // runs real Lighthouse and maps into the same stored payload. A PSI failure
    // keeps the original DataForSEO message — that is the error the user can
    // act on.
    if (asAppError(failed)?.code === "DATAFORSEO_AUTH_FAILED") {
      try {
        const data = await fetchPagespeedLighthouse({ url, strategy });
        return storedPayloadToFetchResult(url, pageId, strategy, data);
      } catch (psiError) {
        console.warn(
          `PageSpeed Insights fallback failed for ${url} (${strategy}): ${psiError instanceof Error ? psiError.message : String(psiError)}`,
        );
      }
    }
    return failedLighthouseFetch(url, pageId, strategy, failed.message);
  }
}

function storedPayloadToFetchResult(
  url: string,
  pageId: string,
  strategy: "mobile" | "desktop",
  data: StoredLighthousePayload,
): LighthouseFetchResult {
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
}

export async function storeLighthouseResult(input: {
  projectId: string;
  auditId: string;
  fetched: LighthouseFetchResult;
}): Promise<LighthouseResult> {
  if (!input.fetched.payloadJson) {
    return input.fetched.result;
  }

  const { pageId, strategy } = input.fetched.result;
  const key = `site-audit/${input.projectId}/${input.auditId}/${pageId}-${strategy}.json`;
  const uploaded = await putTextToR2(key, input.fetched.payloadJson);

  return {
    ...input.fetched.result,
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

  // strategy === "auto": homepage + 1 per URL pattern, capped at 10
  const selected = new Set<string>();

  // Always include the start URL / homepage. Prefer an exact canonical match
  // so distinct 2xx `/path` and `/path/` pages stay distinct, then tolerate a
  // trailing-slash redirect when the exact start URL was not crawled as 2xx.
  const startKey = canonicalUrlKey(startUrl);
  const startPage =
    validPages.find((p) => canonicalUrlKey(p.url) === startKey) ??
    validPages.find(
      (p) =>
        canonicalUrlKeyWithoutTrailingSlash(p.url) ===
        canonicalUrlKeyWithoutTrailingSlash(startUrl),
    );
  if (startPage) selected.add(startPage.url);

  // Group by URL template pattern
  const templateGroups = new Map<string, LighthouseSamplePage>();
  if (startPage) {
    templateGroups.set(
      detectUrlTemplate(new URL(startPage.url).pathname),
      startPage,
    );
  }
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
