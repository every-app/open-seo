export class BodyLimitExceededError extends Error {
  constructor() {
    super("Request body exceeded the configured byte limit.");
    this.name = "BodyLimitExceededError";
  }
}

export async function readBodyCapped(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<Uint8Array> {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        try {
          await reader.cancel("body_limit_exceeded");
        } catch {
          // Cancellation is best-effort. The byte limit is still authoritative.
        }
        throw new BodyLimitExceededError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
