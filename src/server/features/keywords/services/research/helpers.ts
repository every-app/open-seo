import type { KeywordIntent, KeywordResearchRow } from "@/types/keywords";

export type EnrichedKeyword = KeywordResearchRow;

export function normalizeKeyword(input: string): string {
  return input.trim().toLowerCase();
}

/**
 * Alternates rows from two sources into one list, deduping by keyword, so a
 * volume-sorted source can't crowd out the other before the limit is reached.
 */
export function interleaveRows(
  first: EnrichedKeyword[],
  second: EnrichedKeyword[],
  limit: number,
): EnrichedKeyword[] {
  const rows: EnrichedKeyword[] = [];
  const seen = new Set<string>();
  const longest = Math.max(first.length, second.length);

  for (let i = 0; i < longest && rows.length < limit; i++) {
    for (const source of [first, second]) {
      const row = source[i];
      if (!row || seen.has(row.keyword) || rows.length >= limit) continue;
      seen.add(row.keyword);
      rows.push(row);
    }
  }

  return rows;
}

export function normalizeIntent(raw: string | null | undefined): KeywordIntent {
  if (!raw) return "unknown";
  const value = raw.toLowerCase();
  if (value.includes("inform")) return "informational";
  if (value.includes("commerc")) return "commercial";
  if (value.includes("transact")) return "transactional";
  if (value.includes("navig")) return "navigational";
  return "unknown";
}
