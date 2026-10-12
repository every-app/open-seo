import type { PageFetchClass } from "@/shared/audit-fetch-class";

// Challenge pages that can arrive with a 200, as a renderer hands them back:
// Cloudflare's interstitial, and SiteGround's sgcaptcha redirect.
const CHALLENGE_2XX =
  /<title>\s*(?:just a moment\.\.\.|attention required! \| cloudflare)\s*<\/title>|\/\.well-known\/sgcaptcha\//i;

const CHALLENGE_BODY_MARKERS = [
  "just a moment...",
  "challenge-platform",
  "cf-browser-verification",
  "attention required! | cloudflare",
  "verifying you are human",
];

export function classifyFetch(
  statusCode: number,
  mitigated: boolean,
  bodySnippet: string,
): PageFetchClass {
  if (statusCode === 0) return "error";
  // A final 429 means rate limiting, whether retries were exhausted or the
  // requested cooldown exceeded the crawl budget. Checked before
  // cf-mitigated: a Cloudflare rate-limiting rule sets that header too.
  if (statusCode === 429) return "rate_limited";
  if (mitigated) return "blocked";
  if (statusCode === 401 || statusCode === 403) return "blocked";
  // Real pages aren't served as 202 Accepted; bot challenges are (SiteGround,
  // AWS WAF).
  if (statusCode === 202) return "blocked";
  if (statusCode >= 200 && statusCode < 300 && CHALLENGE_2XX.test(bodySnippet))
    return "blocked";
  if (statusCode === 503) {
    const snippet = bodySnippet.toLowerCase();
    if (CHALLENGE_BODY_MARKERS.some((marker) => snippet.includes(marker))) {
      return "blocked";
    }
  }
  return "ok";
}
