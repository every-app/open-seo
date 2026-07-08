import {
  KeywordsDataGoogleAdsKeywordsForKeywordsLiveRequestInfo,
  KeywordsDataGoogleAdsSearchVolumeLiveRequestInfo,
  type KeywordsDataGoogleAdsKeywordsForKeywordsLiveResultInfo,
  type KeywordsDataGoogleAdsSearchVolumeLiveResultInfo,
} from "dataforseo-client";
import { keywordsDataApi } from "@/server/lib/dataforseo/core";
import {
  assertOk,
  buildTaskBilling,
  type DataforseoApiResponse,
} from "@/server/lib/dataforseo/envelope";

// Google Ads keyword data for countries DataForSEO Labs doesn't cover (see
// specs/0004-keyword-data-source-routing.md). Flat-priced per request; items
// carry volume / CPC / competition but no keyword difficulty or intent.
export type AdsKeywordItem = KeywordsDataGoogleAdsSearchVolumeLiveResultInfo;
export type AdsKeywordIdeaItem =
  KeywordsDataGoogleAdsKeywordsForKeywordsLiveResultInfo;

type KeywordsDataResult<T> = { result?: T[] };

function taskItems<T>(task: KeywordsDataResult<T>): T[] {
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
  const response = await keywordsDataApi().googleAdsSearchVolumeLive([
    new KeywordsDataGoogleAdsSearchVolumeLiveRequestInfo({
      keywords: input.keywords,
      ...locationParams,
      language_code: input.languageCode,
    }),
  ]);
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
  const response = await keywordsDataApi().googleAdsKeywordsForKeywordsLive([
    new KeywordsDataGoogleAdsKeywordsForKeywordsLiveRequestInfo({
      keywords: [input.keyword],
      location_code: input.locationCode,
      language_code: input.languageCode,
      sort_by: "search_volume",
    }),
  ]);
  const task = assertOk(response);
  // The endpoint has no limit parameter (it can return thousands of
  // suggestions for one flat fee); truncate to what the caller asked for.
  return {
    data: taskItems(task).slice(0, input.limit),
    billing: buildTaskBilling(task),
  };
}
