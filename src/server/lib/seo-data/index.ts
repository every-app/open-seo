// Public surface of the SEO data routing layer.
//
// Every SEO data request in the application should go through the DataRouter,
// which checks the cache, tries free/internal providers first, and falls back
// to DataForSEO only when necessary. Provider selection logic lives here and
// nowhere else.

export { DataRouter, withBudgetGuard } from "./data-router";
export { SeoCacheService, passthroughSchema } from "./cache-service";
export { singleFlight, clearSingleFlight } from "./single-flight";
export {
  getCostCounters,
  resetCostCounters,
  recordCacheHit,
  recordCacheMiss,
  recordFreeProviderCall,
  recordDataforseoFallback,
  recordDataforseoCall,
  assertDataforseoBudgetAvailable,
  isDataforseoBudgetAvailable,
  getDataforseoBudgetConfig,
  logRequest,
  type CostCounters,
  type RequestLogEntry,
} from "./cost-tracker";
export {
  getCacheTtl,
  getDefaultCacheTtl,
  getAllCacheTtls,
  getProviderFeatureFlags,
  resetProviderConfigCache,
  type ProviderFeatureFlags,
} from "./config";
export {
  ProviderUnavailableError,
  ProviderUnsupportedError,
  BudgetExceededError,
  AuthenticationError,
  RateLimitError,
  toAppError,
} from "./errors";
export { getSeoDataRouter, resetSeoDataRouter } from "./registry";
export { createDataforseoProvider } from "./providers/dataforseo-provider";
export { createGscProvider } from "./providers/gsc-provider";
export { createGoogleAdsProvider } from "./providers/google-ads-provider";
export { createBingWebmasterProvider } from "./providers/bing-webmaster-provider";
export { createLocalCrawlerProvider } from "./providers/local-crawler-provider";
export { createInternalProvider } from "./providers/internal-provider";
export {
  isBlockedHostname,
  isCrawlTargetBlocked,
} from "./providers/ssrf-guard";

export type {
  SEODataProvider,
  SEODataRequest,
  SEODataResponse,
  SEODataType,
  SEODataRequest as SeoDataRequest,
  SEODataResponse as SeoDataResponse,
  ProviderOutcome,
} from "./types";
