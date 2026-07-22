import type { EnrichedKeyword } from "./helpers";

export type KeywordSource = "related" | "suggestions" | "ideas";
export type KeywordMode = "auto" | KeywordSource;
/**
 * Where research rows actually came from. "google_ads" is not requestable as
 * a mode; it's the automatic source for countries Labs doesn't support.
 */
export type ResearchSource = KeywordSource | "google_ads";

export const AUTO_KEYWORD_SOURCES: KeywordSource[] = [
  "related",
  "suggestions",
  "ideas",
];

export const MIN_NON_SEED_FOR_AUTO = 5;

const RESEARCH_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "for",
  "from",
  "in",
  "near",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

function tokenizeKeyword(keyword: string): Set<string> {
  return new Set(
    (keyword.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
      (token) => !RESEARCH_STOP_WORDS.has(token),
    ),
  );
}

function hasTopicalOverlap(keyword: string, seedTokens: Set<string>): boolean {
  const keywordTokens = tokenizeKeyword(keyword);
  const requiredOverlap = seedTokens.size === 1 ? 1 : 2;
  let overlap = 0;

  for (const token of keywordTokens) {
    if (!seedTokens.has(token)) continue;
    overlap += 1;
    if (overlap >= requiredOverlap) return true;
  }

  return false;
}

export function filterTopicallyRelevantRows(
  rows: EnrichedKeyword[],
  seedKeyword: string,
): EnrichedKeyword[] {
  const normalizedSeed = seedKeyword.trim().toLowerCase();
  const seedTokens = tokenizeKeyword(normalizedSeed);
  const filteredRows = rows.filter(
    (row) =>
      row.keyword === normalizedSeed ||
      hasTopicalOverlap(row.keyword, seedTokens),
  );
  const hasRelevantExpansion = filteredRows.some(
    (row) => row.keyword !== normalizedSeed,
  );

  if (hasRelevantExpansion) return filteredRows;

  return filteredRows.filter(
    (row) => row.keyword === normalizedSeed && (row.searchVolume ?? 0) > 0,
  );
}

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
