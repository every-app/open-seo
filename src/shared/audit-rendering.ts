import {
  autumnSeoDataCreditsToUsd,
  creditsForProviderUsd,
} from "@/shared/billing";

// Cloudflare Browser Run bills browser time at $0.09 an hour. Every attempt is
// billed as its full timeout, not its measured time, so one attempt has one
// fixed price and the low end of the estimate is exact.
export const CLOUDFLARE_RENDER_TIMEOUT_MS = 20_000;
const CLOUDFLARE_USD_PER_BROWSER_HOUR = 0.09;
const CLOUDFLARE_USD_PER_ATTEMPT =
  (CLOUDFLARE_RENDER_TIMEOUT_MS / 3_600_000) * CLOUDFLARE_USD_PER_BROWSER_HOUR;
// Context.dev list price on the Developer plan. One scrape is one credit.
const CONTEXT_USD_PER_CREDIT = 0.0025;

/** Provider units a rendered audit used, counted per crawl chunk. */
export type RenderUsage = {
  cloudflareAttempts: number;
  contextCredits: number;
};

export function renderUsageCredits(usage: RenderUsage): number {
  return creditsForProviderUsd(
    usage.cloudflareAttempts * CLOUDFLARE_USD_PER_ATTEMPT +
      usage.contextCredits * CONTEXT_USD_PER_CREDIT,
  );
}

/**
 * Usage-credit range for rendering up to `maxPages` pages. The low end renders
 * every page on Cloudflare. The high end is every page falling back to Context
 * after its Cloudflare attempt, which is also what a hosted audit reserves.
 */
export function estimateRenderingCredits(maxPages: number) {
  return {
    low: renderUsageCredits({
      cloudflareAttempts: maxPages,
      contextCredits: 0,
    }),
    high: renderUsageCredits({
      cloudflareAttempts: maxPages,
      contextCredits: maxPages,
    }),
  };
}

/**
 * Usage credits as the dollars users see everywhere else. Rounded up to the
 * cent, so an account holding the shown amount always covers the hold.
 */
function formatRenderingUsd(credits: number) {
  const cents = Math.ceil(autumnSeoDataCreditsToUsd(credits * 100));
  return `$${(cents / 100).toFixed(2)}`;
}

/** Why a hosted account cannot start a rendered audit of `maxPages` pages. */
export function renderingCreditsNeededText(maxPages: number) {
  const { high } = estimateRenderingCredits(maxPages);
  return `Rendering up to ${maxPages.toLocaleString("en-US")} pages needs ${formatRenderingUsd(high)} of credits available. Lower the page limit or add credits.`;
}

export function renderingEstimateText(maxPages: number) {
  const { low, high } = estimateRenderingCredits(maxPages);
  return `Estimated ${formatRenderingUsd(low)} to ${formatRenderingUsd(high)} for up to ${maxPages.toLocaleString("en-US")} pages. Sites with aggressive bot detection need our more capable renderer and cost more.`;
}
