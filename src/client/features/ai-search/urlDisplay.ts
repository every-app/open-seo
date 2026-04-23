/**
 * Prettify a URL for display: drop Chrome scroll-to-text fragments (`#:~:`)
 * and decode percent-encoding so `%20` becomes a space. Google AI Overview
 * citations routinely carry 200-char text fragments that are useful in the
 * href (they scroll the browser to the cited passage) but pure visual noise
 * as link text.
 *
 * The original URL is still what gets navigated to — only the visible text
 * changes. Falls back to the raw input if parsing fails.
 */
export function formatUrlForDisplay(value: string): string {
  try {
    const url = new URL(value);
    const hash = url.hash.startsWith("#:~:") ? "" : url.hash;
    const cleaned = `${url.protocol}//${url.host}${url.pathname}${url.search}${hash}`;
    try {
      return decodeURI(cleaned);
    } catch {
      return cleaned;
    }
  } catch {
    return value;
  }
}
