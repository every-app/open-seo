export { LOCATIONS, getLanguageCode } from "./locations";

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
