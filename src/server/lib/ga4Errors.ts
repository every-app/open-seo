export class Ga4AdminApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "Ga4AdminApiError";
  }
}

export class Ga4TokenError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "Ga4TokenError";
  }
}

export class Ga4DataApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly retryAfterSeconds: number | null = null,
    public readonly upstreamReason: string | null = null,
  ) {
    super(message);
    this.name = "Ga4DataApiError";
  }
}

export class Ga4MalformedResponseError extends Error {
  constructor() {
    super("Google Analytics returned an invalid reporting response.");
    this.name = "Ga4MalformedResponseError";
  }
}

export type Ga4ReportErrorCode =
  | "validation_error"
  | "ga4_not_connected"
  | "ga4_reconnect_required"
  | "ga4_property_inaccessible"
  | "ga4_report_incompatible"
  | "ga4_quota_exhausted"
  | "ga4_upstream_unavailable"
  | "ga4_malformed_response";

export class Ga4ReportError extends Error {
  constructor(
    public readonly code: Ga4ReportErrorCode,
    message: string,
    public readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "Ga4ReportError";
  }
}

export type Ga4ReportErrorDetail = {
  code: Ga4ReportErrorCode;
  message: string;
  retryAfterSeconds?: number;
};

/**
 * Collapse reporting failures into the small, user-safe contract exposed by
 * dashboard server functions. Unexpected exceptions intentionally use a
 * generic message rather than leaking an upstream response or credential.
 */
export function toSafeGa4ReportErrorDetail(
  error: unknown,
): Ga4ReportErrorDetail {
  if (error instanceof Ga4ReportError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.retryAfterSeconds == null
        ? {}
        : { retryAfterSeconds: error.retryAfterSeconds }),
    };
  }
  return {
    code: "ga4_upstream_unavailable",
    message: "Google Analytics reporting is temporarily unavailable.",
  };
}
