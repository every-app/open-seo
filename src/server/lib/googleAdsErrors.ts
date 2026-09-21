export class GoogleAdsApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /** Google error detail code, e.g. "DEVELOPER_TOKEN_NOT_APPROVED". */
    public readonly upstreamReason: string | null = null,
    /** Google's own explanation, e.g. "The following field may not be used in
     *  SELECT clause: 'local_services_lead.credit_details'." Never shown to
     *  users (`message` is the user-facing text), only logged. */
    public readonly upstreamMessage: string | null = null,
  ) {
    super(message);
    this.name = "GoogleAdsApiError";
  }
}

/** Structured log fields for a caught Google Ads failure. Users only ever see
 *  a generic message, so the log line built from these is the one place
 *  Google's own explanation survives — a grep instead of a hand replay. */
export function errorLogDetails(error: unknown) {
  return {
    errorName: error instanceof Error ? error.name : "UnknownError",
    status: error instanceof GoogleAdsApiError ? error.status : undefined,
    reason:
      error instanceof GoogleAdsApiError ? error.upstreamReason : undefined,
    upstreamMessage:
      error instanceof GoogleAdsApiError ? error.upstreamMessage : undefined,
  };
}

/** Google-side onboarding states that block Ads API access until Google
 *  flips a bit (token approval, Cloud project production approval, API
 *  enablement). These clear on their own once onboarding finishes, so they
 *  surface as "access pending" rather than a failure. Shared so the picker
 *  and reporting paths can never drift apart again. */
const ACCESS_PENDING_REASONS: ReadonlySet<string> = new Set([
  "DEVELOPER_TOKEN_NOT_APPROVED",
  "DEVELOPER_TOKEN_PROHIBITED",
  "MISSING_DEVELOPER_TOKEN",
  "SERVICE_DISABLED",
  "CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION",
]);

export function isAccessPendingReason(reason: string | null): boolean {
  return reason !== null && ACCESS_PENDING_REASONS.has(reason);
}

export class GoogleAdsTokenError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "GoogleAdsTokenError";
  }
}

/** GOOGLE_ADS_DEVELOPER_TOKEN is not configured on this deployment. */
export class GoogleAdsConfigError extends Error {
  constructor() {
    super("Google Ads is not configured. Set GOOGLE_ADS_DEVELOPER_TOKEN.");
    this.name = "GoogleAdsConfigError";
  }
}

type GoogleAdsReportErrorCode =
  | "validation_error"
  | "google_ads_not_connected"
  | "google_ads_setup_required"
  | "google_ads_reconnect_required"
  // Developer token or Cloud project awaiting Google approval, or the Ads
  // API not yet enabled on the OAuth client's Cloud project — expected until
  // onboarding finishes.
  | "google_ads_access_pending"
  | "google_ads_account_inaccessible"
  | "google_ads_quota_exhausted"
  // Google 400 / INVALID_ARGUMENT: the request itself is rejected (bad field,
  // bad query). Retrying the same call cannot succeed.
  | "google_ads_request_rejected"
  | "google_ads_upstream_unavailable"
  | "google_ads_malformed_response";

export class GoogleAdsReportError extends Error {
  constructor(
    public readonly code: GoogleAdsReportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GoogleAdsReportError";
  }
}
