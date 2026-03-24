export function normalizeAuthRedirect(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
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
