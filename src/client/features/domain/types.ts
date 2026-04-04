export type KeywordRow = {
  keyword: string;
  position: number | null;
  searchVolume: number | null;
  traffic: number | null;
  cpc: number | null;
  url: string | null;
  relativeUrl: string | null;
  keywordDifficulty: number | null;
};

export type PageRow = {
  page: string;
  relativePath: string | null;
  organicTraffic: number | null;
  keywords: number | null;
};

export type DomainFilterValues = {
  include: string;
  exclude: string;
  minTraffic: string;
  maxTraffic: string;
  minVol: string;
  maxVol: string;
  minCpc: string;
  maxCpc: string;
  minKd: string;
  maxKd: string;
  minRank: string;
  maxRank: string;
};

export const EMPTY_DOMAIN_FILTERS: DomainFilterValues = {
  include: "",
  exclude: "",
  minTraffic: "",
  maxTraffic: "",
  minVol: "",
  maxVol: "",
  minCpc: "",
  maxCpc: "",
  minKd: "",
  maxKd: "",
  minRank: "",
  maxRank: "",
};

export type DomainControlsValues = {
  domain: string;
  subdomains: boolean;
  sort: "rank" | "traffic" | "volume" | "score" | "cpc";
};

export type DomainSortMode = DomainControlsValues["sort"];
export type SortOrder = "asc" | "desc";
export type DomainActiveTab = "keywords" | "pages";

export type DomainOverviewData = {
  domain: string;
  organicTraffic: number | null;
  organicKeywords: number | null;
  backlinks: number | null;
  referringDomains: number | null;
  hasData: boolean;
  keywords: KeywordRow[];
  pages: PageRow[];
};

export type DomainHistoryItem = {
  timestamp: number;
  domain: string;
  subdomains: boolean;
  sort: DomainSortMode;
  tab: DomainActiveTab;
  search?: string;
};
