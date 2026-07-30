/** Better Auth providerId for the incremental Google Search Console connection.
 *  Kept in `shared` so both server (auth config, GSC client) and client (connect
 *  button) can reference it without importing the server-only auth config. */
export const GSC_OAUTH_PROVIDER_ID = "google-search-console";

export const GSC_OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/webmasters.readonly",
] as const;

export const GSC_SELF_HOSTED_SETUP_DOCS_URL =
  "https://github.com/every-app/open-seo/blob/main/docs/SELF_HOSTING_GOOGLE_SEARCH_CONSOLE.md";

/** PASS | PARTIAL | FAIL | NEUTRAL | VERDICT_UNSPECIFIED, per the URL
 *  Inspection API. Kept as a string: an unrecognised verdict should surface,
 *  not throw. */
export type GscVerdict = string;

/** ERROR | WARNING | SEVERITY_UNSPECIFIED. */
export type GscSeverity = string;

/**
 * Rich results Google found on its last crawl, grouped by result type.
 *
 * This is the authoritative verdict for a live page — Google's own parser on
 * Google's own crawl — which is why the issue messages are surfaced verbatim
 * rather than re-derived locally.
 */
export type RichResultsResult = {
  verdict?: GscVerdict;
  detectedItems?: Array<{
    richResultType?: string;
    items?: Array<{
      name?: string;
      issues?: Array<{ issueMessage?: string; severity?: GscSeverity }>;
    }>;
  }>;
};

/** One rich-result issue, flattened out of the nested wire shape for display. */
type FlatRichResultIssue = {
  richResultType: string;
  itemName: string | null;
  issueMessage: string;
  severity: GscSeverity;
};

/**
 * Flattens `richResultsResult.detectedItems[].items[].issues[]` into a list.
 * The nesting carries no information a reader needs — the result type and the
 * item name are what locate an issue — and three levels of optional arrays are
 * awkward for every consumer to walk.
 */
export function flattenRichResultIssues(
  result: RichResultsResult | undefined,
): FlatRichResultIssue[] {
  const flattened: FlatRichResultIssue[] = [];
  for (const detected of result?.detectedItems ?? []) {
    const richResultType = detected.richResultType ?? "Unknown";
    for (const item of detected.items ?? []) {
      for (const issue of item.issues ?? []) {
        if (!issue.issueMessage) continue;
        flattened.push({
          richResultType,
          itemName: item.name ?? null,
          issueMessage: issue.issueMessage,
          severity: issue.severity ?? "SEVERITY_UNSPECIFIED",
        });
      }
    }
  }
  return flattened;
}
