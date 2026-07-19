import { LocationSelect } from "@/client/components/LocationSelect";
import {
  getLanguageCode,
  getLanguageOptions,
} from "@/client/features/keywords/locations";
import type { ProjectMarket } from "@/client/features/projects/types";

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

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Country</span>
        <LocationSelect
          value={value.locationCode}
          onChange={(locationCode) =>
            onChange({
              locationCode,
              languageCode: getLanguageCode(locationCode),
            })
          }
        />
      </label>
      <label
        className={`${hideLanguageOnMobile ? "hidden sm:flex" : "flex"} flex-col gap-1.5 text-sm`}
      >
        <span className="font-medium">Language</span>
        <select
          value={value.languageCode}
          onChange={(event) =>
            onChange({ ...value, languageCode: event.target.value })
          }
          // Most countries have exactly one language DataForSEO serves, so the
          // select is only a real choice where there's more than one.
          disabled={languageOptions.length <= 1}
          className="select select-bordered w-full"
        >
          {languageOptions.map((option) => (
            <option key={option.code} value={option.code}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
