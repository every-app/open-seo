type UmamiErrorCode =
  | "validation_error"
  | "umami_not_connected"
  | "umami_url_blocked"
  | "umami_unreachable"
  | "umami_auth_failed"
  | "umami_two_factor_required"
  | "umami_website_inaccessible"
  | "umami_unsupported_version"
  | "umami_rate_limited"
  | "umami_malformed_response";

/** Every Umami failure, from the HTTP client up through the reports. Messages
 *  never carry credentials or response bodies. */
export class UmamiError extends Error {
  constructor(
    public readonly code: UmamiErrorCode,
    message: string,
    public readonly status: number | null = null,
  ) {
    super(message);
    this.name = "UmamiError";
  }
}
