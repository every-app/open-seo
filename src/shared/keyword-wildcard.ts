import { isLabsLocationCode } from "./keyword-locations";

/**
 * Wildcard seeds like "best * for dogs", where `*` stands for any word or
 * words. Research searches DataForSEO for the longest literal stretch (the
 * anchor) and keeps only keywords that match the whole pattern.
 */
export function hasKeywordWildcard(seed: string): boolean {
  return seed.includes("*");
}

/** The longest stretch of text between wildcards, e.g. "for dogs". */
export function wildcardAnchor(seed: string): string {
  return seed
    .split("*")
    .map((part) => part.trim().replace(/\s+/g, " "))
    .reduce((longest, part) => (part.length > longest.length ? part : longest));
}

/** Why a wildcard seed can't be researched, or null when it can. */
export function keywordWildcardError(
  seed: string,
  locationCode: number,
): string | null {
  if (!hasKeywordWildcard(seed)) return null;
  if (!wildcardAnchor(seed)) {
    return "Add at least one word besides *, like best * for dogs.";
  }
  if (!isLabsLocationCode(locationCode)) {
    return "Wildcard search isn't available for this country.";
  }
  return null;
}
