import { useId } from "react";
import { CountryCombobox } from "@/client/components/CountryCombobox";
import { Field, FieldLabel } from "@/client/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import {
  getLanguageCode,
  getLanguageOptions,
} from "@/client/features/keywords/locations";
import type { ProjectMarket } from "@/client/features/projects/types";
import type { LOCATION_OPTIONS } from "@/shared/keyword-locations";

/**
 * A market: country plus the language served for it. Shared by project
 * settings, onboarding, and AI visibility setup so the pair — and the rule
 * that changing the country snaps the language to that country's native one —
 * stays identical everywhere.
 */
export function ProjectMarketFields({
  value,
  onChange,
  hideLanguageOnMobile = false,
  countryOptions,
}: {
  value: ProjectMarket;
  onChange: (market: ProjectMarket) => void;
  hideLanguageOnMobile?: boolean;
  /** Defaults to the full country list. */
  countryOptions?: typeof LOCATION_OPTIONS;
}) {
  const countryId = useId();
  const languageId = useId();
  const languageItems = getLanguageOptions(value.locationCode).map(
    (option) => ({ value: option.code, label: option.label }),
  );
  // Most countries have exactly one language DataForSEO serves, so the
  // select is only a real choice where there's more than one.
  const languageDisabled = languageItems.length <= 1;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field>
        <FieldLabel htmlFor={countryId}>Country</FieldLabel>
        <CountryCombobox
          id={countryId}
          value={value.locationCode}
          options={countryOptions}
          onChange={(locationCode) =>
            onChange({
              locationCode,
              languageCode: getLanguageCode(locationCode),
            })
          }
        />
      </Field>
      <Field
        className={hideLanguageOnMobile ? "hidden sm:flex" : undefined}
        data-disabled={languageDisabled}
      >
        <FieldLabel htmlFor={languageId}>Language</FieldLabel>
        <Select
          items={languageItems}
          value={value.languageCode}
          onValueChange={(languageCode) => {
            if (languageCode) onChange({ ...value, languageCode });
          }}
          disabled={languageDisabled}
        >
          <SelectTrigger id={languageId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {languageItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}
