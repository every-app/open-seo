// Dashboard URL builder. The base URL is derived per-request from the incoming
// MCP request's origin so it works correctly across hosted, self-hosted, and
// dev environments without needing an env var.

export function buildDashboardUrl(
  baseUrl: string,
  path: string,
  params?: Record<string, string | number | undefined>,
): string {
  const url = new URL(path.startsWith("/") ? path : `/${path}`, baseUrl);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value == null) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/**
 * A guest account's link to a real one: it signs the person up (or in) and
 * hands them the guest's organization, then lands them on `next`.
 */
export function buildGuestClaimUrl(
  baseUrl: string,
  guestClaimToken: string,
  next?: string,
): string {
  return buildDashboardUrl(baseUrl, "/api/guest-claim", {
    token: guestClaimToken,
    next,
  });
}

// Search Performance hosts the connection card and the data the user came for,
// so land them there rather than in settings. A guest has no account to
// connect Google to yet, so its link creates one first.
export function buildConnectGscUrl(
  baseUrl: string,
  projectId: string,
  guestClaimToken: string | undefined,
): string {
  const path = `/p/${projectId}/search-performance`;
  return guestClaimToken
    ? buildGuestClaimUrl(baseUrl, guestClaimToken, path)
    : buildDashboardUrl(baseUrl, path);
}
