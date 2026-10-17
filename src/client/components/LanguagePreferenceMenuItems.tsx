import { Languages } from "lucide-react";
import { SegmentedToggle } from "@/client/components/SegmentedToggle";
import {
  DropdownMenuLabel,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/client/components/ui/dropdown-menu";
import { useLocale, type Locale } from "@/client/lib/i18n";

const LANGUAGE_OPTIONS: {
  value: Locale;
  label: string;
  icon: React.ReactNode;
}[] = [
  {
    value: "de",
    label: "Deutsch",
    icon: (
      <span className="text-[11px] font-semibold uppercase leading-none">
        DE
      </span>
    ),
  },
  {
    value: "en",
    label: "English",
    icon: (
      <span className="text-[11px] font-semibold uppercase leading-none">
        EN
      </span>
    ),
  },
];

/** Deutsch / English segmented radio toggle */
export function LanguagePreferenceRadio() {
  const { locale, setLocale } = useLocale();

  return (
    <SegmentedToggle
      items={LANGUAGE_OPTIONS}
      value={locale}
      onChange={setLocale}
    />
  );
}

export function LanguagePreferenceDropdownItems() {
  const { locale, setLocale, t } = useLocale();

  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel className="flex items-center gap-1.5">
        <Languages className="size-3.5 text-muted-foreground" />
        {t("common.language")}
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={locale}
        onValueChange={(value) => {
          if (value === "de" || value === "en") {
            setLocale(value);
          }
        }}
      >
        {LANGUAGE_OPTIONS.map(({ value, label }) => (
          <DropdownMenuRadioItem key={value} value={value}>
            {label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenuGroup>
  );
}
