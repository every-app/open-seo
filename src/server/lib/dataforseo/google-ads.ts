import { dataforseoPost } from "@/server/lib/dataforseo/core";
import type { LabsMonthlySearch } from "@/server/lib/dataforseo/labs";
import {
  assertOk,
  buildTaskBilling,
  type DataforseoApiResponse,
  type DataforseoTaskLike,
} from "@/server/lib/dataforseo/envelope";

// Google Ads keyword data for countries DataForSEO Labs doesn't cover (see
// docs/maintainers/specs/0004-keyword-data-source-routing.md). Flat-priced per request; items
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

// Google Ads fails the whole search_volume task when one keyword has one of
// these symbols or an emoji, is longer than 80 characters, or has more than
// 10 words.
const ADS_INVALID_KEYWORD_CHARS =
  /[!@%,*(){}<>|^~;=?`]|\p{Extended_Pictographic}/u;

/** Whether Google Ads search_volume accepts this keyword text. */
export function isAdsKeyword(keyword: string): boolean {
  return (
    keyword.length <= 80 &&
    keyword.split(/\s+/).length <= 10 &&
    !ADS_INVALID_KEYWORD_CHARS.test(keyword)
  );
}

// Every language Google Ads accepts, from the free
// GET /v3/keywords_data/google_ads/languages (checked 2026-11-13).
const ADS_LANGUAGE_CODES = new Set(
  "ar bn bg ca zh_CN zh_TW hr cs da nl en et fa fi fr de el iw hi hu is id it ja ko lv lt ms no pl pt ro ru sr sk sl es sv tl ta te th tr uk ur vi".split(
    " ",
  ),
);

// Google Ads names these project-market languages differently.
const ADS_LANGUAGE_ALIASES: Record<string, string> = {
  nb: "no",
  he: "iw",
  "zh-CN": "zh_CN",
  "zh-TW": "zh_TW",
};

/**
 * The language to send Google Ads, or undefined for one it does not have
 * (Albanian, Armenian, Azerbaijani, Bosnian, Macedonian). Sending such a code
 * fails the task. Without a language, Google Ads returns the same volumes as
 * it does for English.
 */
function adsLanguageCode(languageCode: string): string | undefined {
  const code = ADS_LANGUAGE_ALIASES[languageCode] ?? languageCode;
  return ADS_LANGUAGE_CODES.has(code) ? code : undefined;
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
        language_code: adsLanguageCode(input.languageCode),
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
        language_code: adsLanguageCode(input.languageCode),
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
