export class CruxApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: string,
  ) {
    super(message);
    this.name = "CruxApiError";
  }
}

/** User-facing message per CrUX HTTP status. 404 never reaches here — the
 *  client maps it to a no-data result upstream because an origin missing from
 *  the CrUX dataset is an expected outcome, not a fault. */
export function messageForStatus(status: number, body: string): string {
  if (status === 400) {
    return "Chrome UX Report rejected the request (invalid CRUX_API_KEY or malformed parameters).";
  }
  if (status === 403) {
    return "Chrome UX Report API is disabled for this API key's Google Cloud project. Enable it in the Google Cloud console.";
  }
  if (status === 429) {
    return "Chrome UX Report rate limit reached. Retry shortly.";
  }
  return `Chrome UX Report API error (${status}): ${body.slice(0, 300)}`;
}
