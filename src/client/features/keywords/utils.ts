export { LOCATIONS } from "./locations";

// Difficulty tiers, easy (green) to very hard (deep red), as Badge colour
// overrides. Text takes a darker shade on light and a lighter one on dark.
export function scoreTierClass(value: number | null): string {
  if (value == null) return "bg-muted text-muted-foreground ring-border";
  if (value <= 20) return "bg-success/15 text-success ring-success/30";
  if (value <= 35)
    return "bg-lime-400/15 text-lime-800 ring-lime-400/30 dark:text-lime-300";
  if (value <= 50) return "bg-warning/15 text-warning ring-warning/30";
  if (value <= 65)
    return "bg-orange-400/15 text-orange-800 ring-orange-400/30 dark:text-orange-300";
  if (value <= 80) return "bg-destructive/20 text-negative ring-destructive/35";
  return "bg-destructive/30 text-rose-900 ring-destructive/50 dark:text-rose-300";
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

export function formatCompactNumber(value: number | null | undefined): string {
  if (value == null) return "-";
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}
