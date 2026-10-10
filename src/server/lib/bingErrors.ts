export class BingApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: string,
  ) {
    super(message);
    this.name = "BingApiError";
  }
}

/** Bing throttled this server's IP address (ErrorCode 17, "ThrottleIP"). Shared
 *  cloud egress — Cloudflare Workers among them — is routinely throttled, and
 *  it is not the credential's fault, so it must not read as a bad key. */
export class BingThrottleError extends Error {
  constructor(
    public readonly status: number,
    public readonly body?: string,
  ) {
    super("Bing is throttling this server's IP address.");
    this.name = "BingThrottleError";
  }
}

/** Bing rejected the stored API key (invalid, revoked, or lacking permission).
 *  The user can act on this by generating a new key, so it is surfaced as a
 *  reconnect prompt rather than fault-logged. */
export class BingAuthError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "BingAuthError";
  }
}

export class BingNotConnectedError extends Error {
  constructor(public readonly projectId: string) {
    super("Bing Webmaster Tools is not connected for this project");
    this.name = "BingNotConnectedError";
  }
}
