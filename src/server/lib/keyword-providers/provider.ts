import { hasBingCredentials } from "./bing";
import { hasGoogleAdsCredentials } from "./google-ads";
import type { KeywordIdeaItem } from "./types";

export type KeywordProviderName = "google_ads" | "bing" | "none";

export type KeywordProviderSelection = {
  active: KeywordProviderName;
  googleAds: boolean;
  bing: boolean;
};

/**
 * Resolves the active keyword-data provider: Google Ads (Keyword Planner)
 * first, Bing Webmaster as the fallback. `none` means neither is configured
 * and callers should fail with a configuration error.
 */
export async function resolveKeywordProvider(): Promise<KeywordProviderSelection> {
  const [googleAds, bing] = await Promise.all([
    hasGoogleAdsCredentials().catch(() => false),
    hasBingCredentials().catch(() => false),
  ]);

  const active: KeywordProviderName = googleAds
    ? "google_ads"
    : bing
      ? "bing"
      : "none";
  return { active, googleAds, bing };
}

export type KeywordIdeaRequest = {
  seedKeyword: string;
  locationCode: number;
  languageCode: string;
  resultLimit: number;
};

/**
 * Fetches provider-neutral keyword idea rows from the active provider.
 * Both providers return idea-style rows, so the legacy DataForSEO source
 * modes (related / suggestions / ideas) collapse into one idea query.
 */
export async function fetchKeywordIdeaRows(
  params: KeywordIdeaRequest,
): Promise<{ provider: Exclude<KeywordProviderName, "none">; items: KeywordIdeaItem[] }> {
  const status = await resolveKeywordProvider();

  if (status.active === "google_ads") {
    const { fetchGoogleAdsKeywordIdeas } = await import("./google-ads");
    return {
      provider: "google_ads",
      items: await fetchGoogleAdsKeywordIdeas({
        keyword: params.seedKeyword,
        locationCode: params.locationCode,
        languageCode: params.languageCode,
        limit: params.resultLimit,
      }),
    };
  }

  if (status.active === "bing") {
    const { fetchBingKeywordIdeasAsItems } = await import("./bing");
    return {
      provider: "bing",
      items: await fetchBingKeywordIdeasAsItems({
        keyword: params.seedKeyword,
        languageCode: params.languageCode,
        locationCode: params.locationCode,
        limit: params.resultLimit,
      }),
    };
  }

  throw new Error(
    "No keyword data provider configured. Set Google Ads (GOOGLE_ADS_*) or Bing Webmaster (BING_WEBMASTER_API_KEY) environment variables.",
  );
}
