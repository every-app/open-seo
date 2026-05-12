export type KeywordIntent =
  | "informational"
  | "commercial"
  | "transactional"
  | "navigational"
  | "unknown";

export type MonthlySearch = {
  year: number;
  month: number;
  searchVolume: number;
};

export type KeywordResearchRow = {
  keyword: string;
  searchVolume: number | null;
  trend: MonthlySearch[];
  keywordDifficulty: number | null;
  cpc: number | null;
  competition: number | null;
  intent: KeywordIntent;
};

export type SavedKeywordRow = {
  id: string;
  projectId: string;
  keyword: string;
  locationCode: number;
  languageCode: string;
  createdAt: string;
  searchVolume: number | null;
  cpc: number | null;
  competition: number | null;
  keywordDifficulty: number | null;
  intent: string | null;
  monthlySearches: MonthlySearch[];
  fetchedAt: string | null;
  tags: SavedKeywordTag[];
};

export type SavedKeywordTag = {
  id: string;
  name: string;
  normalizedName: string;
  /** Palette key (e.g. "blue"). Null = derive a stable color from the id. */
  color: string | null;
};

export type SavedKeywordTagSummary = SavedKeywordTag & {
  keywordCount: number;
};

export type SerpResultItem = {
  rank: number;
  title: string;
  url: string;
  domain: string;
  description: string;
  etv: number | null;
  estimatedPaidTrafficCost: number | null;
  referringDomains: number | null;
  backlinks: number | null;
  isNew: boolean;
  rankChange: number | null;
};
