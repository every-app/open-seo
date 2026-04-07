export const DEFAULT_LOCATION_CODE = 2840;

export const LOCATION_OPTIONS = [
  { code: 2840, label: "United States", shortLabel: "US", languageCode: "en" },
  { code: 2826, label: "United Kingdom", shortLabel: "UK", languageCode: "en" },
  { code: 2124, label: "Canada", shortLabel: "CA", languageCode: "en" },
  { code: 2036, label: "Australia", shortLabel: "AU", languageCode: "en" },
  { code: 2372, label: "Ireland", shortLabel: "IE", languageCode: "en" },
  { code: 2554, label: "New Zealand", shortLabel: "NZ", languageCode: "en" },
  { code: 2356, label: "India", shortLabel: "IN", languageCode: "en" },
  { code: 2702, label: "Singapore", shortLabel: "SG", languageCode: "en" },
  { code: 2710, label: "South Africa", shortLabel: "ZA", languageCode: "en" },
  { code: 2608, label: "Philippines", shortLabel: "PH", languageCode: "en" },
  { code: 2276, label: "Germany", shortLabel: "DE", languageCode: "de" },
  { code: 2250, label: "France", shortLabel: "FR", languageCode: "fr" },
  { code: 2528, label: "Netherlands", shortLabel: "NL", languageCode: "nl" },
  { code: 2724, label: "Spain", shortLabel: "ES", languageCode: "es" },
  { code: 2380, label: "Italy", shortLabel: "IT", languageCode: "it" },
  { code: 2620, label: "Portugal", shortLabel: "PT", languageCode: "pt" },
  { code: 2040, label: "Austria", shortLabel: "AT", languageCode: "de" },
  { code: 2756, label: "Switzerland", shortLabel: "CH", languageCode: "de" },
  { code: 2752, label: "Sweden", shortLabel: "SE", languageCode: "sv" },
  { code: 2578, label: "Norway", shortLabel: "NO", languageCode: "nb" },
  { code: 2208, label: "Denmark", shortLabel: "DK", languageCode: "da" },
  { code: 2616, label: "Poland", shortLabel: "PL", languageCode: "pl" },
  { code: 2203, label: "Czechia", shortLabel: "CZ", languageCode: "cs" },
  { code: 2642, label: "Romania", shortLabel: "RO", languageCode: "ro" },
  { code: 2792, label: "Turkey", shortLabel: "TR", languageCode: "tr" },
  { code: 2300, label: "Greece", shortLabel: "GR", languageCode: "el" },
  { code: 2348, label: "Hungary", shortLabel: "HU", languageCode: "hu" },
  { code: 2076, label: "Brazil", shortLabel: "BR", languageCode: "pt" },
  { code: 2484, label: "Mexico", shortLabel: "MX", languageCode: "es" },
  { code: 2032, label: "Argentina", shortLabel: "AR", languageCode: "es" },
  { code: 2170, label: "Colombia", shortLabel: "CO", languageCode: "es" },
  { code: 2152, label: "Chile", shortLabel: "CL", languageCode: "es" },
  { code: 2604, label: "Peru", shortLabel: "PE", languageCode: "es" },
  { code: 2392, label: "Japan", shortLabel: "JP", languageCode: "ja" },
  { code: 2410, label: "South Korea", shortLabel: "KR", languageCode: "ko" },
  { code: 2360, label: "Indonesia", shortLabel: "ID", languageCode: "id" },
  { code: 2458, label: "Malaysia", shortLabel: "MY", languageCode: "ms" },
  { code: 2764, label: "Thailand", shortLabel: "TH", languageCode: "th" },
  { code: 2704, label: "Vietnam", shortLabel: "VN", languageCode: "vi" },
  {
    code: 2784,
    label: "United Arab Emirates",
    shortLabel: "AE",
    languageCode: "en",
  },
  { code: 2682, label: "Saudi Arabia", shortLabel: "SA", languageCode: "ar" },
  { code: 2050, label: "Bangladesh", shortLabel: "BD", languageCode: "bn" },
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
