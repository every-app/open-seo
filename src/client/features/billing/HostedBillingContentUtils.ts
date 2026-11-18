import { TOP_UP_MAX_USD, TOP_UP_MIN_USD } from "@/shared/billing";

/** A whole-dollar amount typed into a billing field, within [min, max].
 *  `parsed` falls back to `fallback` while the field is invalid so a pending
 *  checkout link always has a usable amount. */
export function parseUsdAmount(
  value: string,
  {
    min = TOP_UP_MIN_USD,
    max = TOP_UP_MAX_USD,
    fallback = 20,
  }: { min?: number; max?: number; fallback?: number } = {},
) {
  const trimmed = value.trim();

  if (!/^\d+$/.test(trimmed)) {
    return { isValid: false, parsed: fallback };
  }

  const parsed = Number(trimmed);
  const isValid = Number.isInteger(parsed) && parsed >= min && parsed <= max;

  return {
    isValid,
    parsed: isValid ? parsed : fallback,
  };
}

export function parseTopUpAmount(value: string) {
  return parseUsdAmount(value);
}
