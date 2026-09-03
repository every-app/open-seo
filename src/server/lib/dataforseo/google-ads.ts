import { dataforseoPost } from "@/server/lib/dataforseo/core";
import type { LabsMonthlySearch } from "@/server/lib/dataforseo/labs";
import {
  assertOk,
  buildTaskBilling,
  type DataforseoApiResponse,
  type DataforseoTaskLike,
} from "@/server/lib/dataforseo/envelope";

// Google Ads keyword data for countries DataForSEO Labs doesn't cover (see
// specs/0004-keyword-data-source-routing.md). Flat-priced per request; items
// carry volume / CPC / competition but no keyword difficulty or intent.
export interface AdsKeywordItem {
  keyword?: string | null;
  search_volume?: number | null;
  cpc?: number | null;
  /** "LOW" | "MEDIUM" | "HIGH" bucket (Labs reports a 0-1 ratio instead). */
  competition?: string | null;
  /** 0-100 competition scale; the app stores a 0-1 ratio. */
  competition_index?: number | null;
  monthly_searches?: LabsMonthlySearch[] | null;
  [key: string]: unknown;
}
export type AdsKeywordIdeaItem = AdsKeywordItem;

type KeywordsDataTask<T> = DataforseoTaskLike & { result?: T[] };

function taskItems<T>(task: KeywordsDataTask<T>): T[] {
  // keywords_data tasks return keyword items directly in `result` (no nested
  // `items` wrapper like Labs).
  return task.result ?? [];
}

export async function fetchAdsSearchVolume(input: {
  keywords: string[];
  locationCode: number;
  languageCode: string;
  /**
   * Canonical DataForSEO location_name (e.g. "Pittsburgh,Pennsylvania,United
   * States"). Google Ads accepts any geotarget, so this scopes volume / CPC /
   * competition to a city or region instead of the whole country.
   */
  locationName?: string;
}): Promise<DataforseoApiResponse<AdsKeywordItem[]>> {
  const locationParams = input.locationName
    ? { location_name: input.locationName }
    : { location_code: input.locationCode };
  const response = await dataforseoPost<KeywordsDataTask<AdsKeywordItem>>(
    "/v3/keywords_data/google_ads/search_volume/live",
    [
      {
        keywords: input.keywords,
        ...locationParams,
        language_code: input.languageCode,
      },
    ],
  );
  const task = assertOk(response);
  return {
    data: taskItems(task),
    billing: buildTaskBilling(task),
  };
}

export async function fetchAdsKeywordIdeas(input: {
  keyword: string;
  locationCode: number;
  languageCode: string;
  limit: number;
}): Promise<DataforseoApiResponse<AdsKeywordIdeaItem[]>> {
  const response = await dataforseoPost<KeywordsDataTask<AdsKeywordIdeaItem>>(
    "/v3/keywords_data/google_ads/keywords_for_keywords/live",
    [
      {
        keywords: [input.keyword],
        location_code: input.locationCode,
        language_code: input.languageCode,
        sort_by: "search_volume",
      },
    ],
  );
  const task = assertOk(response);
  // The endpoint has no limit parameter (it can return thousands of
  // suggestions for one flat fee); truncate to what the caller asked for.
  return {
    data: taskItems(task).slice(0, input.limit),
    billing: buildTaskBilling(task),
  };
}
