// The light/dark pick shared with the Every App launcher and every other app
// behind the same gateway. Each app has its own host (`<app>.<gateway host>`),
// so localStorage is per app; a cookie on the gateway host reaches all of
// them. Keep the name, values and domain as they are: the other apps read the
// same cookie. Off Every App there is no gateway host and no cookie.

import type { ThemePreference } from "@/client/lib/theme";

export const THEME_COOKIE_PATTERN =
  /(?:^|;\s*)everyapp-theme=(system|light|dark)(?:;|$)/;

/** The pick in a `document.cookie` string, or null when there is none. */
export function readThemeCookie(cookie: string): ThemePreference | null {
  const value = THEME_COOKIE_PATTERN.exec(cookie)?.[1];
  return value === "system" || value === "light" || value === "dark"
    ? value
    : null;
}

/**
 * The cookie's Domain: the gateway's hostname, when the page is on it or on
 * one of its subdomains. Null otherwise (a custom hostname, or no gateway),
 * and the pick then stays in localStorage.
 */
export function themeCookieDomain(
  pageHostname: string,
  gatewayUrl: string | null | undefined,
): string | null {
  if (!gatewayUrl) return null;
  const gateway = new URL(gatewayUrl).hostname.toLowerCase();
  const page = pageHostname.toLowerCase();
  if (page === gateway || page.endsWith(`.${gateway}`)) return gateway;
  return null;
}

/** The `document.cookie` assignment that stores a pick. */
export function themeCookieString(
  themePreference: ThemePreference,
  domain: string,
  secure: boolean,
): string {
  return [
    `everyapp-theme=${themePreference}`,
    // `localhost` gets a host-only cookie, which reaches every port.
    ...(domain.includes(".") ? [`Domain=${domain}`] : []),
    "Path=/",
    "Max-Age=31536000",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}
