import { useId } from "react";
import { LocationSelect } from "@/client/components/LocationSelect";
import {
  getLanguageCode,
  getLanguageOptions,
} from "@/client/features/keywords/locations";
import type { ProjectMarket } from "@/client/features/projects/types";

import { Field } from "@/client/components/ui/field";
import { Label } from "@/client/components/ui/label";
import { NativeSelect } from "@/client/components/ui/native-select";

/**
 * The project's default market: country plus the language served for it.
 * Shared by project settings and onboarding so the pair — and the rule that
 * changing the country snaps the language to that country's native one —
 * stays identical in both places.
 */
export function ProjectMarketFields({
  value,
  onChange,
  hideLanguageOnMobile = false,
}: {
  value: ProjectMarket;
  onChange: (market: ProjectMarket) => void;
  hideLanguageOnMobile?: boolean;
}) {
  const languageOptions = getLanguageOptions(value.locationCode);
  const countryId = useId();
  const countryLabelId = useId();
  const languageId = useId();

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field>
        <Label id={countryLabelId} htmlFor={countryId}>
          Country
        </Label>
        {/* Labelled by the label and the trigger itself, so the name carries
            the selected country as well as "Country". */}
        <LocationSelect
          id={countryId}
          aria-labelledby={`${countryLabelId} ${countryId}`}
          value={value.locationCode}
          onChange={(locationCode) =>
            onChange({
              locationCode,
              languageCode: getLanguageCode(locationCode),
            })
          }
        />
      </Field>
      <Field className={hideLanguageOnMobile ? "hidden sm:block" : undefined}>
        <Label htmlFor={languageId}>Language</Label>
        <NativeSelect
          id={languageId}
          value={value.languageCode}
          onChange={(event) =>
            onChange({ ...value, languageCode: event.target.value })
          }
          // Most countries have exactly one language DataForSEO serves, so the
          // select is only a real choice where there's more than one.
          disabled={languageOptions.length <= 1}
          className="w-full"
        >
          {languageOptions.map((option) => (
            <option key={option.code} value={option.code}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
    </div>
  );
}
