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

type Ga4ReportErrorCode =
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
