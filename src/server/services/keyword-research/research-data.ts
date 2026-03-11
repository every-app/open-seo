import { fetchRelatedKeywordsRaw } from "@/server/lib/dataforseo";
import type { ResearchKeywordsInput } from "@/types/schemas/keywords";
import {
  normalizeIntent,
  normalizeKeyword,
  type EnrichedKeyword,
} from "./helpers";

export async function fetchResearchRows(
  input: ResearchKeywordsInput,
  uniqueKeywords: string[],
): Promise<EnrichedKeyword[]> {
  const seedKeyword = uniqueKeywords[0];
  if (!seedKeyword) {
    return [];
  }

  const items = await fetchRelatedKeywordsRaw(
    seedKeyword,
    input.locationCode,
    input.languageCode,
    input.resultLimit,
    3,
  );

  const rows: EnrichedKeyword[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const keywordData = item.keyword_data;
    const keyword = keywordData.keyword;
    if (!keyword) continue;

    const normalizedKeyword = normalizeKeyword(keyword);
    if (seen.has(normalizedKeyword)) continue;
    seen.add(normalizedKeyword);

    const keywordInfo = keywordData.keyword_info_normalized_with_clickstream
      ?.search_volume
      ? keywordData.keyword_info_normalized_with_clickstream
      : keywordData.keyword_info;

    rows.push({
      keyword: normalizedKeyword,
      searchVolume: keywordInfo?.search_volume ?? null,
      trend: (keywordInfo?.monthly_searches ?? []).map((entry) => ({
        year: entry.year,
        month: entry.month,
        searchVolume: entry.search_volume ?? 0,
      })),
      cpc: keywordData.keyword_info?.cpc ?? null,
      competition: keywordData.keyword_info?.competition ?? null,
      keywordDifficulty:
        keywordData.keyword_properties?.keyword_difficulty ?? null,
      intent: normalizeIntent(keywordData.search_intent_info?.main_intent),
    });
  }

  return rows;
}
