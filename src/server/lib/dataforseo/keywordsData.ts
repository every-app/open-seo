import {
  KeywordsDataGoogleAdsSearchVolumeLiveRequestInfo,
  type KeywordsDataGoogleAdsSearchVolumeLiveResultInfo,
} from "dataforseo-client";
import { keywordsDataApi } from "@/server/lib/dataforseo/core";
import {
  assertOk,
  buildTaskBilling,
  type DataforseoApiResponse,
} from "@/server/lib/dataforseo/envelope";

// The search_volume live response returns keyword rows directly as the task
// result array (no nested `items`). `competition` is a string enum here
// ("LOW"/"MEDIUM"/"HIGH"), distinct from the numeric Labs competition.
type KeywordSearchVolumeRow = KeywordsDataGoogleAdsSearchVolumeLiveResultInfo;

export async function fetchKeywordSearchVolume(input: {
  keywords: string[];
  locationCode?: number;
  languageCode?: string;
}): Promise<DataforseoApiResponse<KeywordSearchVolumeRow[]>> {
  const response = await keywordsDataApi().googleAdsSearchVolumeLive([
    new KeywordsDataGoogleAdsSearchVolumeLiveRequestInfo({
      keywords: input.keywords,
      location_code: input.locationCode,
      language_code: input.languageCode,
    }),
  ]);
  const task = assertOk(response);
  return {
    data: task.result ?? [],
    billing: buildTaskBilling(task),
  };
}
