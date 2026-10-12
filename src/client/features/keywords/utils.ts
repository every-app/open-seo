import { sortBy } from "remeda";
import type { MonthlySearch } from "@/types/keywords";

export { LOCATIONS } from "./locations";

export const MONTH_SHORT_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** The most recent 12 months of a trend, oldest first. */
export function lastTwelveMonths(trend: MonthlySearch[]): MonthlySearch[] {
  return sortBy(trend, (item) => item.year * 100 + item.month).slice(-12);
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
