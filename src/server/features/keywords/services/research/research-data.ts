import {
  fetchKeywordIdeasRaw,
  fetchKeywordSuggestionsRaw,
  fetchRelatedKeywordsRaw,
  type LabsKeywordDataItem,
} from "@/server/lib/dataforseo";
import {
  normalizeIntent,
  normalizeKeyword,
  type EnrichedKeyword,
} from "./helpers";
import type { KeywordSource } from "./selection";

type FetchResearchRowsParams = {
  seedKeyword: string;
  locationCode: number;
  languageCode: string;
  resultLimit: number;
  source: KeywordSource;
};

function mapKeywordDataItems(items: LabsKeywordDataItem[]): EnrichedKeyword[] {
  const rows: EnrichedKeyword[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const keyword = item.keyword;
    if (!keyword) continue;

    const normalized = normalizeKeyword(keyword);
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    const keywordInfo = item.keyword_info_normalized_with_clickstream
      ?.search_volume
      ? item.keyword_info_normalized_with_clickstream
      : item.keyword_info;

    rows.push({
      keyword: normalized,
      searchVolume: keywordInfo?.search_volume ?? null,
      trend: (keywordInfo?.monthly_searches ?? []).map((entry) => ({
        year: entry.year,
        month: entry.month,
        searchVolume: entry.search_volume ?? 0,
      })),
      cpc: item.keyword_info?.cpc ?? null,
      competition: item.keyword_info?.competition ?? null,
      keywordDifficulty: item.keyword_properties?.keyword_difficulty ?? null,
      intent: normalizeIntent(item.search_intent_info?.main_intent),
    });
  }

  return rows;
}

async function fetchRelatedRows(
  params: Omit<FetchResearchRowsParams, "source">,
) {
  const items = await fetchRelatedKeywordsRaw(
    params.seedKeyword,
    params.locationCode,
    params.languageCode,
    params.resultLimit,
    3,
  );

  const rows: EnrichedKeyword[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const keywordData = item.keyword_data;
    const keyword = keywordData.keyword;
    if (!keyword) continue;

    const normalized = normalizeKeyword(keyword);
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    const keywordInfo = keywordData.keyword_info_normalized_with_clickstream
      ?.search_volume
      ? keywordData.keyword_info_normalized_with_clickstream
      : keywordData.keyword_info;

    rows.push({
      keyword: normalized,
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

export async function fetchResearchRowsBySource(
  params: FetchResearchRowsParams,
): Promise<EnrichedKeyword[]> {
  if (params.source === "related") {
    return fetchRelatedRows(params);
  }

  if (params.source === "suggestions") {
    return mapKeywordDataItems(
      await fetchKeywordSuggestionsRaw(
        params.seedKeyword,
        params.locationCode,
        params.languageCode,
        params.resultLimit,
      ),
    );
  }

  return mapKeywordDataItems(
    await fetchKeywordIdeasRaw(
      params.seedKeyword,
      params.locationCode,
      params.languageCode,
      params.resultLimit,
    ),
  );
}
