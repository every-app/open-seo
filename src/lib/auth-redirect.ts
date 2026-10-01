import { appPath } from "@/shared/app-path";

const OAUTH_AUTHORIZE_PATH = appPath("/api/auth/oauth2/authorize");
const OAUTH_SIGNED_QUERY_END = "sig";
const OAUTH_AUTHORIZE_MARKERS = ["response_type", "client_id", "redirect_uri"];

export function normalizeAuthRedirect(value: string | null | undefined) {
  // Backslashes are rejected because URL parsers treat them as slashes:
  // "/\evil.com" resolves cross-origin, an open redirect via
  // window.location sinks.
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return appPath("/");
  }

  return value;
}

export function getOAuthSignedQuery(search: string | null | undefined) {
  if (!search) return null;

  const params = new URLSearchParams(search);
  if (
    !params.has(OAUTH_SIGNED_QUERY_END) ||
    !OAUTH_AUTHORIZE_MARKERS.every((marker) => params.has(marker))
  ) {
    return null;
  }

  // Better Auth signs the authorize params it appends to `loginPage`.
  // Preserve only the signed segment through `sig`; any later params belong to
  // the app page URL and must not be folded into the OAuth continuation.
  const signedParams = new URLSearchParams();
  for (const [key, value] of params.entries()) {
    signedParams.append(key, value);
    if (key === OAUTH_SIGNED_QUERY_END) break;
  }

  return signedParams.toString();
}

function getOAuthAuthorizeRedirectFromSearch(
  search: string | null | undefined,
) {
  const signedQuery = getOAuthSignedQuery(search);
  return signedQuery ? `${OAUTH_AUTHORIZE_PATH}?${signedQuery}` : null;
}

export function getAuthRedirectFromSearch(
  search: string | null | undefined,
  redirect: string | null | undefined,
) {
  return (
    getOAuthAuthorizeRedirectFromSearch(search) ??
    normalizeAuthRedirect(redirect)
  );
}

export function getCurrentAuthRedirect(
  redirect: string | null | undefined,
  location: Pick<Location, "search"> | null | undefined = typeof window !==
  "undefined"
    ? window.location
    : null,
) {
  return getAuthRedirectFromSearch(location?.search, redirect);
}

export function getCurrentAuthRedirectFromHref(href: string) {
  const url = new URL(href, "https://openseo.local");
  return normalizeAuthRedirect(`${url.pathname}${url.search}${url.hash}`);
}

/**
 * Routes served as a raw document by a server handler, with no client
 * component. They are still matchable in the generated client route tree, where
 * a route with no component renders an empty shell — so an SPA navigation to
 * one lands the user on a blank page. Navigate to these with a document load.
 */
export function isDocumentRoute(redirectTo: string) {
  // Both member reports and public shares are served by document handlers.
  return redirectTo.startsWith("/r/") || redirectTo.startsWith("/s/");
}

/**
 * Better Auth only accepts a relative callbackURL made of a narrow character
 * set, so a redirect like an MCP authorize URL (`redirect_uri=http://...`) or
 * one with a `#hash` fails as "Invalid callbackURL". An absolute same-origin
 * URL is checked against trustedOrigins by origin alone. Reads `window`, so
 * call it from event handlers, not during render.
 */
export function toAuthCallbackURL(redirectTo: string) {
  return new URL(redirectTo, window.location.origin).toString();
}

export function getSignInSearch(redirectTo: string) {
  return redirectTo === appPath("/") ? {} : { redirect: redirectTo };
}

export function getVerifyEmailSearch(
  email: string | undefined,
  redirectTo: string,
) {
  const search: { email?: string; redirect?: string } = {};
  if (email) search.email = email;
  if (redirectTo !== appPath("/")) search.redirect = redirectTo;
  return search;
}

export function getSignInHref(redirectTo: string) {
  const search = getSignInSearch(redirectTo);
  if (!("redirect" in search)) {
    return appPath("/sign-in");
  }

  return `${appPath("/sign-in")}?redirect=${encodeURIComponent(search.redirect ?? appPath("/"))}`;
}

export function getSignInHrefForLocation(location: {
  pathname: string;
  search: string;
  hash?: string;
}) {
  return getSignInHref(
    normalizeAuthRedirect(
      `${location.pathname}${location.search}${location.hash ?? ""}`,
    ),
  );
}
