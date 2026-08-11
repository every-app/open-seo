import type { BillingCustomerContext } from "@/server/billing/subscription";

export type SEODataType =
  | "keyword_ideas"
  | "keyword_metrics"
  | "serp"
  | "domain_keywords"
  | "domain_overview"
  | "domain_pages"
  | "competitors"
  | "backlinks"
  | "site_audit"
  | "search_console"
  | "bing_search_performance";

export type SEODataRequest = {
  dataType: SEODataType;
  keyword?: string;
  keywords?: string[];
  domain?: string;
  url?: string;
  urls?: string[];
  locationCode?: number;
  languageCode?: string;
  device?: "desktop" | "mobile";
  dateFrom?: string;
  dateTo?: string;
  /** Maximum age of cached data in seconds; 0 = always fresh. */
  maxAgeSeconds?: number;
  /** Caller-attributed billing context. */
  billingCustomer: BillingCustomerContext;
  /** Optional credit feature attribution (e.g. "onboarding"). */
  creditFeature?: string;
  /** Provider-specific constraints passed through. */
  constraints?: Record<string, unknown>;
};

export type SEODataResponse<T = unknown> = {
  dataType: SEODataType;
  provider: string;
  data: T;
  fromCache: boolean;
  fallbackReason?: string;
  durationMs: number;
};

export interface SEODataProvider {
  readonly name: string;
  supports(request: SEODataRequest): boolean;
  get(request: SEODataRequest): Promise<unknown>;
}

export type ProviderOutcome =
  | { status: "success"; data: unknown; provider: string }
  | { status: "unsupported" }
  | { status: "unavailable"; reason: string }
  | { status: "budget_exceeded" };