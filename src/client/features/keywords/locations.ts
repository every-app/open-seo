/**
 * DataForSEO-supported countries.
 *
 * Source: https://cdn.dataforseo.com/v3/locations/locations_and_languages_dataforseo_labs_2026_04_06.csv
 *
 * For countries with multiple Google-supported languages, we pick the
 * language with the largest keyword corpus (the primary search market)
 * as the default. DataForSEO Labs APIs accept a single location_code +
 * language_code pair per request, so we expose one entry per country.
 *
 * Entries are sorted alphabetically by country name; pick US as the
 * product-wide default via DEFAULT_LOCATION_CODE below.
 */
export const DEFAULT_LOCATION_CODE = 2840;

export const LOCATION_OPTIONS = [
  { code: 2008, label: "Albania", shortLabel: "AL", languageCode: "sq" },
  { code: 2012, label: "Algeria", shortLabel: "DZ", languageCode: "fr" },
  { code: 2024, label: "Angola", shortLabel: "AO", languageCode: "pt" },
  { code: 2032, label: "Argentina", shortLabel: "AR", languageCode: "es" },
  { code: 2051, label: "Armenia", shortLabel: "AM", languageCode: "hy" },
  { code: 2036, label: "Australia", shortLabel: "AU", languageCode: "en" },
  { code: 2040, label: "Austria", shortLabel: "AT", languageCode: "de" },
  { code: 2031, label: "Azerbaijan", shortLabel: "AZ", languageCode: "az" },
  { code: 2048, label: "Bahrain", shortLabel: "BH", languageCode: "ar" },
  { code: 2050, label: "Bangladesh", shortLabel: "BD", languageCode: "bn" },
  { code: 2056, label: "Belgium", shortLabel: "BE", languageCode: "nl" },
  { code: 2068, label: "Bolivia", shortLabel: "BO", languageCode: "es" },
  {
    code: 2070,
    label: "Bosnia and Herzegovina",
    shortLabel: "BA",
    languageCode: "bs",
  },
  { code: 2076, label: "Brazil", shortLabel: "BR", languageCode: "pt" },
  { code: 2100, label: "Bulgaria", shortLabel: "BG", languageCode: "bg" },
  { code: 2854, label: "Burkina Faso", shortLabel: "BF", languageCode: "fr" },
  { code: 2116, label: "Cambodia", shortLabel: "KH", languageCode: "en" },
  { code: 2120, label: "Cameroon", shortLabel: "CM", languageCode: "fr" },
  { code: 2124, label: "Canada", shortLabel: "CA", languageCode: "en" },
  { code: 2152, label: "Chile", shortLabel: "CL", languageCode: "es" },
  { code: 2170, label: "Colombia", shortLabel: "CO", languageCode: "es" },
  { code: 2188, label: "Costa Rica", shortLabel: "CR", languageCode: "es" },
  { code: 2384, label: "Cote d'Ivoire", shortLabel: "CI", languageCode: "fr" },
  { code: 2191, label: "Croatia", shortLabel: "HR", languageCode: "hr" },
  { code: 2196, label: "Cyprus", shortLabel: "CY", languageCode: "el" },
  { code: 2203, label: "Czechia", shortLabel: "CZ", languageCode: "cs" },
  { code: 2208, label: "Denmark", shortLabel: "DK", languageCode: "da" },
  { code: 2218, label: "Ecuador", shortLabel: "EC", languageCode: "es" },
  { code: 2818, label: "Egypt", shortLabel: "EG", languageCode: "ar" },
  { code: 2222, label: "El Salvador", shortLabel: "SV", languageCode: "es" },
  { code: 2233, label: "Estonia", shortLabel: "EE", languageCode: "et" },
  { code: 2246, label: "Finland", shortLabel: "FI", languageCode: "fi" },
  { code: 2250, label: "France", shortLabel: "FR", languageCode: "fr" },
  { code: 2276, label: "Germany", shortLabel: "DE", languageCode: "de" },
  { code: 2288, label: "Ghana", shortLabel: "GH", languageCode: "en" },
  { code: 2300, label: "Greece", shortLabel: "GR", languageCode: "el" },
  { code: 2320, label: "Guatemala", shortLabel: "GT", languageCode: "es" },
  { code: 2344, label: "Hong Kong", shortLabel: "HK", languageCode: "zh-TW" },
  { code: 2348, label: "Hungary", shortLabel: "HU", languageCode: "hu" },
  { code: 2356, label: "India", shortLabel: "IN", languageCode: "en" },
  { code: 2360, label: "Indonesia", shortLabel: "ID", languageCode: "id" },
  { code: 2372, label: "Ireland", shortLabel: "IE", languageCode: "en" },
  { code: 2376, label: "Israel", shortLabel: "IL", languageCode: "he" },
  { code: 2380, label: "Italy", shortLabel: "IT", languageCode: "it" },
  { code: 2392, label: "Japan", shortLabel: "JP", languageCode: "ja" },
  { code: 2400, label: "Jordan", shortLabel: "JO", languageCode: "ar" },
  { code: 2398, label: "Kazakhstan", shortLabel: "KZ", languageCode: "ru" },
  { code: 2404, label: "Kenya", shortLabel: "KE", languageCode: "en" },
  { code: 2428, label: "Latvia", shortLabel: "LV", languageCode: "lv" },
  { code: 2440, label: "Lithuania", shortLabel: "LT", languageCode: "lt" },
  { code: 2458, label: "Malaysia", shortLabel: "MY", languageCode: "en" },
  { code: 2470, label: "Malta", shortLabel: "MT", languageCode: "en" },
  { code: 2484, label: "Mexico", shortLabel: "MX", languageCode: "es" },
  { code: 2498, label: "Moldova", shortLabel: "MD", languageCode: "ro" },
  { code: 2492, label: "Monaco", shortLabel: "MC", languageCode: "fr" },
  { code: 2504, label: "Morocco", shortLabel: "MA", languageCode: "ar" },
  {
    code: 2104,
    label: "Myanmar (Burma)",
    shortLabel: "MM",
    languageCode: "en",
  },
  { code: 2528, label: "Netherlands", shortLabel: "NL", languageCode: "nl" },
  { code: 2554, label: "New Zealand", shortLabel: "NZ", languageCode: "en" },
  { code: 2558, label: "Nicaragua", shortLabel: "NI", languageCode: "es" },
  { code: 2566, label: "Nigeria", shortLabel: "NG", languageCode: "en" },
  {
    code: 2807,
    label: "North Macedonia",
    shortLabel: "MK",
    languageCode: "mk",
  },
  { code: 2578, label: "Norway", shortLabel: "NO", languageCode: "nb" },
  { code: 2586, label: "Pakistan", shortLabel: "PK", languageCode: "en" },
  { code: 2591, label: "Panama", shortLabel: "PA", languageCode: "es" },
  { code: 2600, label: "Paraguay", shortLabel: "PY", languageCode: "es" },
  { code: 2604, label: "Peru", shortLabel: "PE", languageCode: "es" },
  { code: 2608, label: "Philippines", shortLabel: "PH", languageCode: "en" },
  { code: 2616, label: "Poland", shortLabel: "PL", languageCode: "pl" },
  { code: 2620, label: "Portugal", shortLabel: "PT", languageCode: "pt" },
  { code: 2642, label: "Romania", shortLabel: "RO", languageCode: "ro" },
  { code: 2682, label: "Saudi Arabia", shortLabel: "SA", languageCode: "ar" },
  { code: 2686, label: "Senegal", shortLabel: "SN", languageCode: "fr" },
  { code: 2688, label: "Serbia", shortLabel: "RS", languageCode: "sr" },
  { code: 2702, label: "Singapore", shortLabel: "SG", languageCode: "en" },
  { code: 2703, label: "Slovakia", shortLabel: "SK", languageCode: "sk" },
  { code: 2705, label: "Slovenia", shortLabel: "SI", languageCode: "sl" },
  { code: 2710, label: "South Africa", shortLabel: "ZA", languageCode: "en" },
  { code: 2410, label: "South Korea", shortLabel: "KR", languageCode: "ko" },
  { code: 2724, label: "Spain", shortLabel: "ES", languageCode: "es" },
  { code: 2144, label: "Sri Lanka", shortLabel: "LK", languageCode: "en" },
  { code: 2752, label: "Sweden", shortLabel: "SE", languageCode: "sv" },
  { code: 2756, label: "Switzerland", shortLabel: "CH", languageCode: "de" },
  { code: 2158, label: "Taiwan", shortLabel: "TW", languageCode: "zh-TW" },
  { code: 2764, label: "Thailand", shortLabel: "TH", languageCode: "th" },
  { code: 2788, label: "Tunisia", shortLabel: "TN", languageCode: "ar" },
  { code: 2792, label: "Turkiye", shortLabel: "TR", languageCode: "tr" },
  { code: 2804, label: "Ukraine", shortLabel: "UA", languageCode: "uk" },
  {
    code: 2784,
    label: "United Arab Emirates",
    shortLabel: "AE",
    languageCode: "en",
  },
  {
    code: 2826,
    label: "United Kingdom",
    shortLabel: "UK",
    languageCode: "en",
  },
  { code: 2840, label: "United States", shortLabel: "US", languageCode: "en" },
  { code: 2858, label: "Uruguay", shortLabel: "UY", languageCode: "es" },
  { code: 2862, label: "Venezuela", shortLabel: "VE", languageCode: "es" },
  { code: 2704, label: "Vietnam", shortLabel: "VN", languageCode: "vi" },
] as const;

const LOCATION_CODES = new Set<number>(
  LOCATION_OPTIONS.map((option) => option.code),
);

export const LOCATIONS: Record<number, string> = Object.fromEntries(
  LOCATION_OPTIONS.map((option) => [option.code, option.shortLabel]),
);

const LOCATION_LANGUAGE: Record<number, string> = Object.fromEntries(
  LOCATION_OPTIONS.map((option) => [option.code, option.languageCode]),
);

export function getLanguageCode(locationCode: number): string {
  return LOCATION_LANGUAGE[locationCode] ?? "en";
}

export function isSupportedLocationCode(locationCode: number): boolean {
  return LOCATION_CODES.has(locationCode);
}
