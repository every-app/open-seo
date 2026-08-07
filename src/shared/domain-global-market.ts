import { getLanguageCode } from "@/shared/keyword-locations";

/**
 * "Global" is a Domain Overview-only concept: DataForSEO Labs has no
 * worldwide-aggregate endpoint, every request is scoped to one
 * location_code. Querying all ~94 Labs countries per domain search would
 * multiply cost and latency ~94x, so Global approximates "worldwide" by
 * summing/merging results from a fixed set of the largest search markets
 * instead (see GLOBAL_TOP_MARKET_CODES below).
 *
 * 1 is a sentinel, not a real DataForSEO location_code — every real code in
 * shared/keyword-locations.ts is >= 2008.
 */
export const GLOBAL_LOCATION_CODE = 1;

export function isGlobalLocationCode(locationCode: number): boolean {
  return locationCode === GLOBAL_LOCATION_CODE;
}

/** Fixed, domain-agnostic set of the largest search markets (by search volume / economy size). */
export const GLOBAL_TOP_MARKET_CODES = [
  2840, // United States
  2826, // United Kingdom
  2356, // India
  2076, // Brazil
  2276, // Germany
  2250, // France
  2124, // Canada
  2036, // Australia
  2392, // Japan
  2360, // Indonesia
] as const;

export function getGlobalTopMarkets(): {
  locationCode: number;
  languageCode: string;
}[] {
  return GLOBAL_TOP_MARKET_CODES.map((locationCode) => ({
    locationCode,
    languageCode: getLanguageCode(locationCode),
  }));
}

/** Shape-compatible with LocationSelect's LocationOption for the country picker. */
export const GLOBAL_MARKET_OPTION = {
  code: GLOBAL_LOCATION_CODE,
  label: "Global (Top 10 Markets)",
  shortLabel: "🌍",
  languageCode: "en",
} as const;
