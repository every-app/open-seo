const OAUTH_AUTHORIZE_PATH = "/api/auth/oauth2/authorize";
const OAUTH_SIGNED_QUERY_END = "sig";
const OAUTH_AUTHORIZE_MARKERS = ["response_type", "client_id", "redirect_uri"];

export function normalizeAuthRedirect(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
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

export function getOAuthAuthorizeRedirectFromSearch(
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

export function getSignInSearch(redirectTo: string) {
  return redirectTo === "/" ? {} : { redirect: redirectTo };
}

export function getSignInHref(redirectTo: string) {
  const search = getSignInSearch(redirectTo);
  if (!("redirect" in search)) {
    return "/sign-in";
  }

  return `/sign-in?redirect=${encodeURIComponent(search.redirect ?? "/")}`;
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
