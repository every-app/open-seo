import { type DomainRankedKeywordItem } from "@/server/lib/dataforseo";
import { toRelativePath } from "@/server/lib/domainUtils";

export function mapKeywordItem(item: DomainRankedKeywordItem) {
  const keywordData = item.keyword_data;
  const keywordInfo = keywordData?.keyword_info;
  const keywordProperties = keywordData?.keyword_properties;
  const rankedSerpElement = item.ranked_serp_element;
  const serpItem = rankedSerpElement?.serp_item;

  const keyword = keywordData?.keyword ?? item.keyword;
  if (!keyword) return null;

  const url = serpItem?.url ?? rankedSerpElement?.url ?? null;

  const relativeUrl =
    serpItem?.relative_url ??
    rankedSerpElement?.relative_url ??
    (url ? toRelativePath(url) : null);

  const position =
    serpItem?.rank_absolute ?? rankedSerpElement?.rank_absolute ?? null;

  const traffic = serpItem?.etv ?? rankedSerpElement?.etv ?? null;

  const keywordDifficulty =
    keywordProperties?.keyword_difficulty ??
    keywordInfo?.keyword_difficulty ??
    null;

  return {
    keyword,
    position: position != null ? Math.round(position) : null,
    searchVolume:
      keywordInfo?.search_volume != null
        ? Math.round(keywordInfo.search_volume)
        : null,
    traffic: traffic ?? null,
    cpc: keywordInfo?.cpc ?? null,
    url: url ?? null,
    relativeUrl,
    keywordDifficulty:
      keywordDifficulty != null ? Math.round(keywordDifficulty) : null,
  };
}
