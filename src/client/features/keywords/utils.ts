export const LOCATIONS: Record<number, string> = {
  2840: "US",
  2826: "UK",
  2276: "DE",
  2250: "FR",
  2036: "AU",
  2124: "CA",
  2356: "IN",
  2076: "BR",
};

const LOCATION_LANGUAGE: Record<number, string> = {
  2840: "en",
  2826: "en",
  2276: "de",
  2250: "fr",
  2036: "en",
  2124: "en",
  2356: "en",
  2076: "pt",
};

export function getLanguageCode(locationCode: number): string {
  return LOCATION_LANGUAGE[locationCode] ?? "en";
}

export function scoreTierClass(value: number | null): string {
  if (value == null) return "score-tier-na";
  if (value <= 20) return "score-tier-1";
  if (value <= 35) return "score-tier-2";
  if (value <= 50) return "score-tier-3";
  if (value <= 65) return "score-tier-4";
  if (value <= 80) return "score-tier-5";
  return "score-tier-6";
}

export function parseTerms(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[,+]/)
    .map((term) => term.trim())
    .filter(Boolean);
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null) return "-";
  return new Intl.NumberFormat().format(value);
}
