import type { EnrichedKeyword } from "./helpers";

export type KeywordSource = "related" | "suggestions" | "ideas";
export type KeywordMode = "auto" | KeywordSource;

export const AUTO_KEYWORD_SOURCES: KeywordSource[] = [
  "related",
  "suggestions",
  "ideas",
];

export const MIN_NON_SEED_FOR_AUTO = 5;

export function countNonSeedKeywords(
  rows: EnrichedKeyword[],
  seedKeyword: string,
): number {
  const normalizedSeed = seedKeyword.trim().toLowerCase();
  return rows.filter((row) => row.keyword !== normalizedSeed).length;
}

export function hasSufficientCoverage(
  rows: EnrichedKeyword[],
  seedKeyword: string,
  threshold: number = MIN_NON_SEED_FOR_AUTO,
): boolean {
  return countNonSeedKeywords(rows, seedKeyword) >= threshold;
}
