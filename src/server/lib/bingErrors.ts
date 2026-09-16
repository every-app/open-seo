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

/** The stored API key was rejected (401/403) — expired, revoked at Bing, or
 *  never valid. Distinct from BingApiError so callers can tell "reconnect"
 *  apart from a real fault (429/5xx) without inspecting `status` themselves. */
export class BingAuthError extends Error {
  constructor(message = "Bing Webmaster Tools rejected the stored API key.") {
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
