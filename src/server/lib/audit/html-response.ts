import type { Response as BrowserResponse } from "@cloudflare/workers-types";

export const MAX_HTML_BYTES = 1024 * 1024;

export async function readTextUpTo(
  response: Response | BrowserResponse,
  maxBytes: number,
) {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parts: string[] = [];
  let bytesRead = 0;

  try {
    while (bytesRead < maxBytes) {
      const result = await reader.read();
      if (result.done) break;
      const value: unknown = result.value;
      if (!(value instanceof Uint8Array))
        throw new Error("Expected response bytes");

      const remaining = maxBytes - bytesRead;
      const chunk =
        value.byteLength > remaining ? value.subarray(0, remaining) : value;
      bytesRead += chunk.byteLength;
      parts.push(decoder.decode(chunk, { stream: true }));

      if (bytesRead >= maxBytes) {
        await reader.cancel();
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }

  parts.push(decoder.decode());
  return parts.join("");
}

/** The first `maxBytes` of `text` as UTF-8, as readTextUpTo keeps from a body. */
export function truncateToBytes(text: string, maxBytes: number) {
  const bytes = new TextEncoder().encode(text);
  return bytes.length <= maxBytes
    ? text
    : new TextDecoder().decode(bytes.subarray(0, maxBytes));
}
