/**
 * DataForSEO location codes are Google Ads geo-target IDs (DataForSEO adopted
 * Google's constants), so most codes pass through unchanged. Bing Webmaster
 * uses ISO country codes — map the countries the app's location picker
 * exposes; unknown codes fall back to the United States.
 */
export const BING_COUNTRY_BY_LOCATION_CODE: Record<number, string> = {
  2840: "US",
  2826: "GB",
  2124: "CA",
  2036: "AU",
  2276: "DE",
  2250: "FR",
  2724: "ES",
  2484: "MX",
  2392: "JP",
  2356: "IN",
  2312: "IT",
  2288: "NL",
  2264: "AE",
  2107: "CH",
  2054: "MY",
  2168: "ID",
  2331: "SG",
  2011: "NZ",
  2170: "IE",
  2068: "PH",
};

export function bingCountryForLocationCode(
  locationCode: number | undefined,
): string {
  return (
    (locationCode != null
      ? BING_COUNTRY_BY_LOCATION_CODE[locationCode]
      : undefined) ?? "US"
  );
}
