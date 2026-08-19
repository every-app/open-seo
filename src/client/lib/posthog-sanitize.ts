const OAUTH_CONSENT_PATH = "/oauth-consent";

// Better Auth API-key plugin routes that can return a one-time plaintext key.
const API_KEY_NETWORK_PATH_MARKERS = [
  "/api/auth/api-key",
  "/api/auth/apiKey",
] as const;

// Full MCP API keys look like oseo_ + high-entropy secret. Prefix-only UI
// display values (e.g. "oseo_abcd") are shorter and left alone.
const MCP_API_KEY_PATTERN = /\boseo_[A-Za-z0-9_-]{16,}\b/g;

export const POSTHOG_PERSONAL_DATA_QUERY_PARAMETERS = [
  "email",
  "response_type",
  "client_id",
  "redirect_uri",
  "scope",
  "state",
  "code_challenge",
  "code_challenge_method",
  "resource",
] as const;

export type PostHogCapturedNetworkRequest = {
  name: string;
  requestBody?: string;
  responseBody?: string;
  [key: string]: unknown;
};

export function sanitizePostHogUrl(value: string): string {
  try {
    const url = new URL(value);

    // The consent route carries the complete OAuth authorization request. Keep
    // only the route identity in analytics so current URLs, session-entry URLs,
    // referrers, and replay metadata cannot expose present or future params.
    if (url.pathname === OAUTH_CONSENT_PATH) {
      url.search = "";
      return url.toString();
    }

    // Preserve the existing email redaction for URLs outside the consent flow.
    url.searchParams.delete("email");
    return url.toString();
  } catch {
    return value;
  }
}

export function sanitizePostHogProperties(
  properties: Record<string, unknown>,
): Record<string, unknown> {
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value !== "string") continue;
    properties[key] = sanitizePostHogUrl(value);
  }

  return properties;
}

function isApiKeyAuthRequestUrl(name: string): boolean {
  try {
    const pathname = new URL(name, "https://example.invalid").pathname;
    return API_KEY_NETWORK_PATH_MARKERS.some((marker) =>
      pathname.includes(marker),
    );
  } catch {
    return API_KEY_NETWORK_PATH_MARKERS.some((marker) => name.includes(marker));
  }
}

function redactMcpApiKeysInBody(body: string | undefined): string | undefined {
  if (typeof body !== "string" || body.length === 0) return body;
  return body.replace(MCP_API_KEY_PATTERN, "oseo_[REDACTED]");
}

/** Drop or redact bodies that can contain a one-time plaintext MCP API key.
 *  A custom maskCapturedNetworkRequestFn replaces PostHog's default payload
 *  redaction, so this must stay explicit. */
export function sanitizePostHogCapturedNetworkRequest(
  request: PostHogCapturedNetworkRequest,
): PostHogCapturedNetworkRequest {
  const sanitized: PostHogCapturedNetworkRequest = {
    ...request,
    name: sanitizePostHogUrl(request.name),
  };

  if (isApiKeyAuthRequestUrl(request.name)) {
    // Create responses include the full key once; safest is to omit bodies.
    delete sanitized.requestBody;
    delete sanitized.responseBody;
    return sanitized;
  }

  sanitized.requestBody = redactMcpApiKeysInBody(request.requestBody);
  sanitized.responseBody = redactMcpApiKeysInBody(request.responseBody);
  return sanitized;
}
