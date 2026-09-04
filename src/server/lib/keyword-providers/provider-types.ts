export type FetchResearchRowsParams = {
  seedKeyword: string;
  locationCode: number;
  languageCode: string;
  resultLimit: number;
  source: string;
  includeClickstreamData?: boolean;
  creditFeature?: import("@/shared/billing-credit-features").CreditFeature;
};
