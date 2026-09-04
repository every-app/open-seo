export const BING_HTTP_TIMEOUT_MS = 10_000;
export const BING_API_RESPONSE_MAX_BYTES = 1024 * 1024;
export const BING_TOKEN_RESPONSE_MAX_BYTES = 64 * 1024;

/** Raised before parsing when a Bing response exceeds the endpoint's cap. */
export class BingResponseTooLargeError extends Error {
  constructor(public readonly maxBytes: number) {
    super(`Bing response exceeded ${maxBytes} bytes`);
    this.name = "BingResponseTooLargeError";
  }
}

/**
 * Read a response with a byte cap even when Content-Length is absent or lies.
 * Bing responses are JSON, so decoding only after the complete bounded body
 * also avoids counting JavaScript UTF-16 code units as network bytes.
 */
export async function readBingResponseText(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new BingResponseTooLargeError(maxBytes);
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new BingResponseTooLargeError(maxBytes);
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}
