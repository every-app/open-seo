export const GSC_API_DISABLED_MESSAGE =
  "The Search Console API isn't enabled in the Google Cloud project that owns this deployment's OAuth client. Enable it, then retry.";

export class GscApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: string,
  ) {
    super(message);
    this.name = "GscApiError";
  }

  /** Google's 403 when the API isn't enabled in the OAuth client's Cloud
   *  project: a self-host setup fault, not a dead grant. */
  get apiDisabled(): boolean {
    return this.status === 403 && !!this.body?.includes("SERVICE_DISABLED");
  }
}

export class GscTokenError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "GscTokenError";
  }
}

export class GscNotConnectedError extends Error {
  constructor(public readonly projectId: string) {
    super("Search Console is not connected for this project");
    this.name = "GscNotConnectedError";
  }
}
