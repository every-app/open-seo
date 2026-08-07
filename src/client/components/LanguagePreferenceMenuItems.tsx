import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { type LangPreference, useLangPreference } from "@/client/lib/lang";

const LANG_OPTIONS: { value: LangPreference; labelKey: string }[] = [
  { value: "en", labelKey: "lang.english" },
  { value: "ar", labelKey: "lang.arabic" },
];

export function LanguagePreferenceMenuItems() {
  const { t, i18n } = useTranslation();
  const { lang, setLang } = useLangPreference();

  const handleSelect = (next: LangPreference) => {
    setLang(next);
    i18n.changeLanguage(next);
  };

  return (
    <>
      <li className="menu-title pt-2">
        <span>{t("lang.switcher")}</span>
      </li>

      <li>
        <div
          role="radiogroup"
          aria-label={t("lang.switcher")}
          className="flex gap-0.5 rounded-lg bg-base-200 p-0.5"
        >
          {LANG_OPTIONS.map((option) => {
            const isActive = option.value === lang;

            return (
              <div
                key={option.value}
                className="tooltip tooltip-bottom flex flex-1 before:whitespace-nowrap"
                data-tip={t(option.labelKey)}
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  aria-label={t(option.labelKey)}
                  className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                    isActive
                      ? "bg-base-100 text-base-content shadow-sm"
                      : "text-base-content/50 hover:text-base-content/80"
                  }`}
                  onClick={() => handleSelect(option.value)}
                >
                  <Languages className="size-3.5" />
                  {option.value.toUpperCase()}
                </button>
              </div>
            );
          })}
        </div>
      </li>
    </>
  );
}
