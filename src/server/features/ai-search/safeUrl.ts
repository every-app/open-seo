/**
 * Validate a URL string against an http(s) scheme allow-list.
 *
 * AI Search renders citation and top-page URLs as `<a href>` in the UI. The
 * URLs come from either DataForSEO (mostly safe but still external) or LLM
 * responses (untrusted — a crafted prompt can coax a model into emitting
 * `javascript:`/`data:` payloads). Without this filter, those links are
 * clickable from inside an authenticated session.
 *
 * Returns the URL string unchanged if its protocol is `http:` or `https:`,
 * otherwise null. Callers should drop null entries before rendering.
 */
export function safeHttpUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // Reject `user:pass@host` — the hostname the user sees in link text may
    // differ from where the browser authenticates.
    if (url.username || url.password) return null;
    return value;
  } catch {
    return null;
  }
}

/**
 * Extract the bare hostname (without leading `www.`) from a URL string,
 * returning null if the URL is invalid or uses a non-http(s) scheme.
 */
export function safeHostname(value: string | null | undefined): string | null {
  const url = safeHttpUrl(value);
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
