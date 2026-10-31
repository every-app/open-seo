import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { everyAppAccountQueryOptions } from "@/client/features/every-app/everyAppAccountQueries";
import {
  THEME_COOKIE_PATTERN,
  readThemeCookie,
  themeCookieDomain,
  themeCookieString,
} from "@/client/lib/themeCookie";
import { isEveryAppClientAuthMode } from "@/lib/auth-mode";

export type ThemePreference = "system" | "light" | "dark";

const LIGHT_THEME_NAME = "openseo";
const DARK_THEME_NAME = "openseo-dark";

const THEME_STORAGE_KEY = "theme-preference";
const THEME_CHANGE_EVENT = "theme-preference-change";

// Set when localStorage cannot store a pick (private browsing, strict modes,
// a full quota): the pick then holds for this page session and wins over
// whatever localStorage still returns.
let unsavedThemePreference: ThemePreference | null = null;

// Behind an Every App gateway the pick also lives on the shared
// `everyapp-theme` cookie (themeCookie.ts), so it carries between apps.
const everyApp = isEveryAppClientAuthMode();

/** The shared cookie, then this app's own copy, then the OS. */
function readThemePreference(): ThemePreference {
  if (typeof window === "undefined") {
    return "system";
  }
  const shared = readThemeCookie(document.cookie);
  if (shared) {
    return shared;
  }
  if (unsavedThemePreference) {
    return unsavedThemePreference;
  }

  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      return stored;
    }
    return "system";
  } catch {
    return "system";
  }
}

/** Sets the shared cookie when this page is on the gateway host or under it. */
function writeThemeCookie(
  themePreference: ThemePreference,
  gatewayUrl: string | null | undefined,
) {
  const domain = themeCookieDomain(window.location.hostname, gatewayUrl);
  if (!domain) return;
  document.cookie = themeCookieString(
    themePreference,
    domain,
    window.location.protocol === "https:",
  );
}

function writeThemePreference(
  themePreference: ThemePreference,
  gatewayUrl: string | null | undefined,
) {
  writeThemeCookie(themePreference, gatewayUrl);
  try {
    if (themePreference === "system") {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      window.localStorage.setItem(THEME_STORAGE_KEY, themePreference);
    }
    unsavedThemePreference = null;
  } catch {
    unsavedThemePreference = themePreference;
  }
}

function resolveThemeName(themePreference: ThemePreference): string {
  if (themePreference === "light") return LIGHT_THEME_NAME;
  if (themePreference === "dark") return DARK_THEME_NAME;

  // "system" — resolve from OS preference
  if (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return DARK_THEME_NAME;
  }
  return LIGHT_THEME_NAME;
}

function applyThemePreference(themePreference: ThemePreference) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.setAttribute(
    "data-theme",
    resolveThemeName(themePreference),
  );
}

function subscribeToThemePreference(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleThemeChange = () => {
    onStoreChange();
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key && event.key !== THEME_STORAGE_KEY) {
      return;
    }

    onStoreChange();
  };

  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const handleMediaChange = () => {
    // Re-apply when OS preference changes so "system" mode stays in sync
    applyThemePreference(readThemePreference());
    onStoreChange();
  };

  // A pick made in another app's tab fires no event here: read the cookie
  // again when this tab comes back.
  const handleVisibility = () => {
    if (document.visibilityState === "visible") {
      onStoreChange();
    }
  };

  window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
  window.addEventListener("storage", handleStorage);
  mediaQuery.addEventListener("change", handleMediaChange);
  document.addEventListener("visibilitychange", handleVisibility);

  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    window.removeEventListener("storage", handleStorage);
    mediaQuery.removeEventListener("change", handleMediaChange);
    document.removeEventListener("visibilitychange", handleVisibility);
  };
}

export function useThemePreference() {
  const themePreference = React.useSyncExternalStore<ThemePreference>(
    subscribeToThemePreference,
    readThemePreference,
    () => "system",
  );
  const gatewayUrl = useQuery({
    ...everyAppAccountQueryOptions(),
    enabled: everyApp,
  }).data?.gatewayUrl;

  React.useEffect(() => {
    applyThemePreference(themePreference);
  }, [themePreference]);

  // A pick saved here before the shared cookie existed joins it, once.
  React.useEffect(() => {
    if (THEME_COOKIE_PATTERN.test(document.cookie)) return;
    const own = readThemePreference();
    if (own !== "system") writeThemeCookie(own, gatewayUrl);
  }, [gatewayUrl]);

  const setThemePreference = React.useCallback(
    (nextThemePreference: ThemePreference) => {
      writeThemePreference(nextThemePreference, gatewayUrl);
      applyThemePreference(nextThemePreference);
      window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
    },
    [gatewayUrl],
  );

  return { themePreference, setThemePreference };
}

export const themePreferenceInitScript = `(() => {
  try {
    var m = ${THEME_COOKIE_PATTERN.toString()}.exec(document.cookie);
    var p = m ? m[1] : window.localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    var t;
    if (p === "light") t = ${JSON.stringify(LIGHT_THEME_NAME)};
    else if (p === "dark") t = ${JSON.stringify(DARK_THEME_NAME)};
    else t = window.matchMedia("(prefers-color-scheme: dark)").matches ? ${JSON.stringify(DARK_THEME_NAME)} : ${JSON.stringify(LIGHT_THEME_NAME)};
    document.documentElement.setAttribute("data-theme", t);
  } catch {
    document.documentElement.setAttribute("data-theme", ${JSON.stringify(LIGHT_THEME_NAME)});
  }
})();`;
