import type {
  KeywordMode,
  ResultLimit,
} from "@/client/features/keywords/keywordResearchTypes";
import type { BacklinksTargetScope } from "@/types/schemas/backlinks";

export type BacklinksSearchTabInput = {
  type: "backlinks";
  target: string;
  scope: BacklinksTargetScope;
};

export type DomainSearchTabInput = {
  type: "domain";
  domain: string;
  subdomains: boolean;
  locationCode?: number;
};

export type KeywordSearchTabInput = {
  type: "keyword";
  keyword: string;
  locationCode?: number;
  resultLimit: ResultLimit;
  mode: KeywordMode;
  clickstream: boolean;
};

export type SearchTabInput =
  | BacklinksSearchTabInput
  | DomainSearchTabInput
  | KeywordSearchTabInput;

export type SearchTab = {
  id: string;
  label: string;
  input: SearchTabInput;
  createdAt: number;
  viewedAt: number | null;
};
