export type ResultLimit = 150 | 300 | 500;
export const RESULT_LIMITS: ResultLimit[] = [150, 300, 500];

export type KeywordSource = "related" | "suggestions" | "ideas";
export type KeywordMode = "auto" | KeywordSource;

export type KeywordFilterValues = {
  include: string;
  exclude: string;
  minVol: string;
  maxVol: string;
  minCpc: string;
  maxCpc: string;
  minKd: string;
  maxKd: string;
};

export const EMPTY_FILTERS: KeywordFilterValues = {
  include: "",
  exclude: "",
  minVol: "",
  maxVol: "",
  minCpc: "",
  maxCpc: "",
  minKd: "",
  maxKd: "",
};
