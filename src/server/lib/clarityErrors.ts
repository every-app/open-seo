export class ClarityApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "ClarityApiError";
  }
}

export class ClarityMalformedResponseError extends Error {
  constructor() {
    super("Microsoft Clarity returned an invalid Data Export response.");
    this.name = "ClarityMalformedResponseError";
  }
}

type ClarityReportErrorCode =
  | "clarity_not_connected"
  | "clarity_reconnect_required"
  | "clarity_rate_limited"
  | "clarity_request_rejected"
  | "clarity_upstream_unavailable"
  | "clarity_malformed_response"
  | "clarity_setup_required"
  | "clarity_storage_unavailable";

export class ClarityReportError extends Error {
  constructor(
    public readonly code: ClarityReportErrorCode,
    message: string,
    public readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "ClarityReportError";
  }
}
