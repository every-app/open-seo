import { SegmentedToggle } from "@/client/components/SegmentedToggle";
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
export function LanguagePreferenceRadio({
  showLabels = false,
}: {
  showLabels?: boolean;
} = {}) {
  const { locale, setLocale } = useLocale();

  return (
    <SegmentedToggle
      items={LANGUAGE_OPTIONS}
      value={locale}
      onChange={setLocale}
      showLabels={showLabels}
    />
  );
}
