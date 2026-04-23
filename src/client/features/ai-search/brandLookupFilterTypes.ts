export type CitationTab = "pages" | "queries";

export type TopPagesFilterValues = {
  include: string;
  exclude: string;
  platform: string;
  minMentions: string;
  maxMentions: string;
};

export type QueriesFilterValues = {
  include: string;
  exclude: string;
  platform: string;
  minVolume: string;
  maxVolume: string;
};

export const EMPTY_TOP_PAGES_FILTERS: TopPagesFilterValues = {
  include: "",
  exclude: "",
  platform: "",
  minMentions: "",
  maxMentions: "",
};

export const EMPTY_QUERIES_FILTERS: QueriesFilterValues = {
  include: "",
  exclude: "",
  platform: "",
  minVolume: "",
  maxVolume: "",
};
