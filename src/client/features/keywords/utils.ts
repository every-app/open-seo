export { LOCATIONS, getLanguageCode } from "./locations";

export function scoreTierClass(
  value: number | null,
  higherIsBetter?: boolean,
): string {
  if (value == null) return "score-tier-na";
  const v = higherIsBetter ? 100 - value : value;
  if (v <= 20) return "score-tier-1";
  if (v <= 35) return "score-tier-2";
  if (v <= 50) return "score-tier-3";
  if (v <= 65) return "score-tier-4";
  if (v <= 80) return "score-tier-5";
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
