// Shared bounded body reader. Used by the plain site reader (scrape.ts) and the
// Firecrawl client (firecrawl.ts) so both apply the same in-memory cap to an
// untrusted response body instead of each buffering an unbounded amount.

const DEFAULT_MAX_RESPONSE_BYTES = 2_000_000;

/**
 * Reads a response body as text, cancelling and returning null once `maxBytes`
 * is exceeded. Accumulates regardless of content-length, which chunked / CDN
 * responses often omit.
 */
export async function readBoundedText(
  response: Response,
  maxBytes: number = DEFAULT_MAX_RESPONSE_BYTES,
): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let result = "";
  let bytesRead = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    if (bytesRead > maxBytes) {
      await reader.cancel();
      return null;
    }
    result += decoder.decode(value, { stream: true });
  }
  result += decoder.decode();
  return result;
}
