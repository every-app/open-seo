import * as React from "react";

export type LangPreference = "en" | "ar";

const LANG_STORAGE_KEY = "lang-preference";
const LANG_CHANGE_EVENT = "lang-preference-change";

const RTL_LANGS: ReadonlySet<LangPreference> = new Set(["ar"]);

export function isRtl(lang: LangPreference): boolean {
  return RTL_LANGS.has(lang);
}

export function readLangPreference(): LangPreference {
  if (typeof window === "undefined") {
    return "en";
  }

  try {
    const stored = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (stored === "ar" || stored === "en") {
      return stored;
    }
    return "en";
  } catch {
    return "en";
  }
}

function writeLangPreference(lang: LangPreference) {
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // localStorage can be unavailable in private browsing or strict browser modes.
  }
}

export function applyLangPreference(lang: LangPreference) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.setAttribute("lang", lang);
  document.documentElement.setAttribute("dir", isRtl(lang) ? "rtl" : "ltr");
}

function subscribeToLangPreference(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleChange = () => onStoreChange();
  const handleStorage = (event: StorageEvent) => {
    if (event.key && event.key !== LANG_STORAGE_KEY) return;
    onStoreChange();
  };

  window.addEventListener(LANG_CHANGE_EVENT, handleChange);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(LANG_CHANGE_EVENT, handleChange);
    window.removeEventListener("storage", handleStorage);
  };
}

export function useLangPreference() {
  const lang = React.useSyncExternalStore<LangPreference>(
    subscribeToLangPreference,
    readLangPreference,
    () => "en",
  );

  React.useEffect(() => {
    applyLangPreference(lang);
  }, [lang]);

  const setLang = React.useCallback((next: LangPreference) => {
    writeLangPreference(next);
    applyLangPreference(next);
    window.dispatchEvent(new Event(LANG_CHANGE_EVENT));
    // i18next instance itself is updated by the caller (useTranslation hook
    // consumers re-render via the i18next `languageChanged` event once we
    // call i18n.changeLanguage in the LanguageSwitcher component).
  }, []);

  return { lang, setLang };
}

// Runs before hydration (inline <script> in __root.tsx) so the correct
// lang/dir is on <html> for the very first paint — same pattern as
// themePreferenceInitScript, avoids a flash of the wrong direction.
export const langPreferenceInitScript = `(() => {
  try {
    var p = window.localStorage.getItem(${JSON.stringify(LANG_STORAGE_KEY)});
    var lang = (p === "ar") ? "ar" : "en";
    document.documentElement.setAttribute("lang", lang);
    document.documentElement.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
  } catch {
    document.documentElement.setAttribute("lang", "en");
    document.documentElement.setAttribute("dir", "ltr");
  }
})();`;
