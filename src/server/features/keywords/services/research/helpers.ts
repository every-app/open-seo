import type { KeywordIntent, MonthlySearch } from "@/types/keywords";

export type EnrichedKeyword = {
  keyword: string;
  searchVolume: number | null;
  trend: MonthlySearch[];
  cpc: number | null;
  competition: number | null;
  keywordDifficulty: number | null;
  intent: KeywordIntent;
};

export function normalizeKeyword(input: string): string {
  return input.trim().toLowerCase();
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
