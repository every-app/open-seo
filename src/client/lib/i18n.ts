import * as React from "react";
import { de, type TranslationDict } from "@/locales/de";
import { en } from "@/locales/en";

export type Locale = "de" | "en";

export const DEFAULT_LOCALE: Locale = "de";

const LOCALE_STORAGE_KEY = "openseo-locale";
const LOCALE_CHANGE_EVENT = "openseo-locale-change";

const translations: Record<Locale, TranslationDict> = { de, en };

let unsavedLocale: Locale | null = null;

function readLocalePreference(): Locale {
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

function writeLocalePreference(locale: Locale) {
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

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null;
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
  let current: unknown = dict;

  for (const part of parts) {
    if (isRecord(current) && part in current) {
      current = current[part];
    } else {
      current = null;
      break;
    }
  }

  // Fallback to English if not found
  if (typeof current !== "string") {
    let fallback: unknown = translations.en;
    for (const part of parts) {
      if (isRecord(fallback) && part in fallback) {
        fallback = fallback[part];
      } else {
        fallback = null;
        break;
      }
    }
    current = typeof fallback === "string" ? fallback : key;
  }

  const result = typeof current === "string" ? current : key;

  if (params) {
    return result.replace(/\{(\w+)\}/g, (_, paramKey: string) => {
      const val = params[paramKey];
      return val !== undefined ? String(val) : `{${paramKey}}`;
    });
  }

  return result;
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
