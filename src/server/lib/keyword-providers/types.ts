import type { MonthlySearch } from "@/types/keywords";

/**
 * Provider-neutral keyword idea row. Both Google Ads (Keyword Planner) and
 * Bing Webmaster map into this shape; consumers (research, metrics refresh)
 * never see provider-specific fields.
 */
export type KeywordIdeaItem = {
  keyword: string;
  searchVolume: number | null;
  cpc: number | null;
  /** 0-1 ratio (the app's stored scale). */
  competition: number | null;
  monthlySearches: MonthlySearch[];
};

export type KeywordProviderName = "google_ads" | "bing";
