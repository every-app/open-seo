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
 * A guest's way to a full account. Signing up, or in, from the browser that
 * connected the agent claims the guest (claimGuestFromCookie); then they land
 * on `next`.
 */
export function buildGuestSignUpUrl(baseUrl: string, next?: string): string {
  return buildDashboardUrl(baseUrl, "/sign-up", { redirect: next });
}

// Follows a buildGuestSignUpUrl link in what the agent tells the user: the
// claim only happens in the browser that holds the guest's claim cookie.
export const GUEST_SIGN_UP_NOTE =
  "They need to open it in the same browser they used to connect OpenSEO: their projects then move to the new account, and this connection keeps working as that account.";

// Search Performance hosts the connection card and the data the user came for,
// so land them there rather than in settings. A guest has no account to
// connect Google to yet, so its link creates one first.
export function buildConnectGscUrl(
  baseUrl: string,
  projectId: string,
  isGuest: boolean,
): string {
  const path = `/p/${projectId}/search-performance`;
  return isGuest
    ? buildGuestSignUpUrl(baseUrl, path)
    : buildDashboardUrl(baseUrl, path);
}
