import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/client/locales/en.json";
import ar from "@/client/locales/ar.json";
import { readLangPreference } from "@/client/lib/lang";

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      ar: { translation: ar },
    },
    lng: readLangPreference(),
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    returnEmptyString: false,
  });
}

export default i18n;
