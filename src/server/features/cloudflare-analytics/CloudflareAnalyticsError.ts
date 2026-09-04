type CloudflareAnalyticsErrorCode =
  | "not_connected"
  | "encryption_unavailable"
  | "authentication_failed"
  | "zone_not_accessible"
  | "dataset_unavailable"
  | "rate_limited"
  | "upstream_unavailable"
  | "invalid_response";

export const CLOUDFLARE_MAX_RETRY_AFTER_SECONDS = 24 * 60 * 60;

export class CloudflareAnalyticsError extends Error {
  constructor(
    public readonly code: CloudflareAnalyticsErrorCode,
    message: string,
    public readonly retryAfterSeconds?: number,
    public readonly providerErrors: readonly string[] = [],
  ) {
    super(message);
    this.name = "CloudflareAnalyticsError";
  }
}
