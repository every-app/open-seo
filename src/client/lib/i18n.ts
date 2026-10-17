import * as React from "react";
import { de, type TranslationDict } from "@/locales/de";
import { en } from "@/locales/en";

export type Locale = "de" | "en";

export const DEFAULT_LOCALE: Locale = "de";

const LOCALE_STORAGE_KEY = "openseo-locale";
const LOCALE_CHANGE_EVENT = "openseo-locale-change";

const translations: Record<Locale, TranslationDict> = { de, en };

let unsavedLocale: Locale | null = null;

export function readLocalePreference(): Locale {
  if (typeof window === "undefined") {
    return DEFAULT_LOCALE;
  }
  if (unsavedLocale) {
    return unsavedLocale;
  }

  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored === "de" || stored === "en") {
      return stored;
    }
    return DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function writeLocalePreference(locale: Locale) {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    unsavedLocale = null;
  } catch {
    unsavedLocale = locale;
  }
}

function subscribeToLocale(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleLocaleChange = () => {
    onStoreChange();
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key && event.key !== LOCALE_STORAGE_KEY) {
      return;
    }
    onStoreChange();
  };

  window.addEventListener(LOCALE_CHANGE_EVENT, handleLocaleChange);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(LOCALE_CHANGE_EVENT, handleLocaleChange);
    window.removeEventListener("storage", handleStorage);
  };
}

/**
 * Access a nested translation string by dot notation (e.g. "nav.dashboard", "audit.start_audit").
 */
export function getTranslation(
  key: string,
  locale: Locale = readLocalePreference(),
  params?: Record<string, string | number>,
): string {
  const dict = translations[locale] ?? translations[DEFAULT_LOCALE];
  const parts = key.split(".");
  let current: any = dict;

  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = current[part];
    } else {
      current = null;
      break;
    }
  }

  // Fallback to English if not found
  if (typeof current !== "string") {
    let fallback: any = translations.en;
    for (const part of parts) {
      if (fallback && typeof fallback === "object" && part in fallback) {
        fallback = fallback[part];
      } else {
        fallback = null;
        break;
      }
    }
    current = typeof fallback === "string" ? fallback : key;
  }

  if (params && typeof current === "string") {
    return current.replace(/\{(\w+)\}/g, (_, paramKey) =>
      paramKey in params ? String(params[paramKey]) : `{${paramKey}}`,
    );
  }

  return current;
}

/**
 * Hook to access and update the current locale.
 */
export function useLocale() {
  const locale = React.useSyncExternalStore<Locale>(
    subscribeToLocale,
    readLocalePreference,
    () => DEFAULT_LOCALE,
  );

  const setLocale = React.useCallback((nextLocale: Locale) => {
    writeLocalePreference(nextLocale);
    window.dispatchEvent(new Event(LOCALE_CHANGE_EVENT));
  }, []);

  const t = React.useCallback(
    (key: string, params?: Record<string, string | number>) =>
      getTranslation(key, locale, params),
    [locale],
  );

  return { locale, setLocale, t, dict: translations[locale] };
}
