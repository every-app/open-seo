import {
  DEFAULT_LOCATION_CODE,
  LABS_LOCATION_OPTIONS,
  getLanguageCode,
  isLabsLocationCode,
} from "../../../../src/shared/keyword-locations";

/**
 * The countries the free tools offer: every country the app serves through
 * DataForSEO Labs, which backs all the free tools. Google-Ads-only countries
 * are left out because Labs rejects them. The client only ever sends a
 * location code — the server derives the language from the app's list, so an
 * unknown code is rejected rather than passed through.
 */
export const TOOL_COUNTRIES = LABS_LOCATION_OPTIONS;

export const DEFAULT_COUNTRY_CODE = DEFAULT_LOCATION_CODE;

export function countryLanguage(code: number): string | null {
  return isLabsLocationCode(code) ? getLanguageCode(code) : null;
}

export function countryLabel(code: number): string {
  return (
    TOOL_COUNTRIES.find((country) => country.code === code)?.label ?? "Unknown"
  );
}
