import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import type { SEODataType } from "./types";

/**
 * Centralized cache TTL configuration (seconds). Values are sensible defaults
 * and can be overridden per data type via environment variables.
 *
 * Env overrides use the pattern: SEO_CACHE_TTL_{DATA_TYPE}=seconds
 * e.g. SEO_CACHE_TTL_SERP=432000 (5 days)
 */
const DEFAULT_TTL_SECONDS: Record<SEODataType, number> = {
  keyword_ideas: 7 * 24 * 60 * 60, // 7 days
  keyword_metrics: 7 * 24 * 60 * 60, // 7 days
  serp: 5 * 24 * 60 * 60, // 5 days (midpoint of 3-7 day range)
  domain_keywords: 7 * 24 * 60 * 60, // 7 days
  domain_overview: 7 * 24 * 60 * 60, // 7 days
  domain_pages: 7 * 24 * 60 * 60, // 7 days
  competitors: 7 * 24 * 60 * 60, // 7 days
  backlinks: 14 * 24 * 60 * 60, // 14 days (midpoint of 7-30 day range)
  site_audit: 7 * 24 * 60 * 60, // 7 days
  search_console: 24 * 60 * 60, // 24 hours
  bing_search_performance: 24 * 60 * 60, // 24 hours
};

const ENV_KEY_MAP: Record<SEODataType, string> = {
  keyword_ideas: "SEO_CACHE_TTL_KEYWORD_IDEAS",
  keyword_metrics: "SEO_CACHE_TTL_KEYWORD_METRICS",
  serp: "SEO_CACHE_TTL_SERP",
  domain_keywords: "SEO_CACHE_TTL_DOMAIN_KEYWORDS",
  domain_overview: "SEO_CACHE_TTL_DOMAIN_OVERVIEW",
  domain_pages: "SEO_CACHE_TTL_DOMAIN_PAGES",
  competitors: "SEO_CACHE_TTL_COMPETITORS",
  backlinks: "SEO_CACHE_TTL_BACKLINKS",
  site_audit: "SEO_CACHE_TTL_SITE_AUDIT",
  search_console: "SEO_CACHE_TTL_SEARCH_CONSOLE",
  bing_search_performance: "SEO_CACHE_TTL_BING_SEARCH_PERFORMANCE",
};

let cachedConfig: Record<SEODataType, number> | null = null;

async function loadConfig(): Promise<Record<SEODataType, number>> {
  if (cachedConfig) return cachedConfig;

  const result = { ...DEFAULT_TTL_SECONDS };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.keys returns string[]
  for (const dataType of Object.keys(DEFAULT_TTL_SECONDS) as SEODataType[]) {
    const envValue = await getOptionalEnvValue(ENV_KEY_MAP[dataType]);
    if (envValue) {
      const parsed = Number.parseInt(envValue, 10);
      if (Number.isFinite(parsed) && parsed >= 0) {
        result[dataType] = parsed;
      }
    }
  }
  cachedConfig = result;
  return result;
}

export async function getCacheTtl(dataType: SEODataType): Promise<number> {
  const config = await loadConfig();
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- dataType is already a key
  return config[dataType];
}

export function getDefaultCacheTtl(dataType: SEODataType): number {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- dataType is already a key
  return DEFAULT_TTL_SECONDS[dataType];
}

export async function getAllCacheTtls(): Promise<Record<SEODataType, number>> {
  return loadConfig();
}

/**
 * Feature flags for SEO data providers. All default to safe values:
 * - Router: enabled (opt-out via SEO_PROVIDER_ROUTER_ENABLED=false)
 * - Local crawler: enabled (free, always useful)
 * - DataForSEO: enabled (the existing default)
 * - GSC / Google Ads / Bing: disabled (require credentials)
 */
export type ProviderFeatureFlags = {
  routerEnabled: boolean;
  dataforseoEnabled: boolean;
  gscEnabled: boolean;
  googleAdsEnabled: boolean;
  bingWebmasterEnabled: boolean;
  localCrawlerEnabled: boolean;
};

let cachedFlags: ProviderFeatureFlags | null = null;

async function loadFlags(): Promise<ProviderFeatureFlags> {
  if (cachedFlags) return cachedFlags;

  const get = async (name: string): Promise<boolean | undefined> => {
    const v = await getOptionalEnvValue(name);
    if (v === undefined) return undefined;
    return v === "true" || v === "1";
  };

  cachedFlags = {
    routerEnabled: (await get("SEO_PROVIDER_ROUTER_ENABLED")) ?? true,
    dataforseoEnabled: (await get("DATAFORSEO_ENABLED")) ?? true,
    gscEnabled: (await get("GOOGLE_SEARCH_CONSOLE_ENABLED")) ?? false,
    googleAdsEnabled: (await get("GOOGLE_ADS_ENABLED")) ?? false,
    bingWebmasterEnabled: (await get("BING_WEBMASTER_ENABLED")) ?? false,
    localCrawlerEnabled: (await get("LOCAL_CRAWLER_ENABLED")) ?? true,
  };
  return cachedFlags;
}

export async function getProviderFeatureFlags(): Promise<ProviderFeatureFlags> {
  return loadFlags();
}

/** Reset cached config/flags — used by tests. */
export function resetProviderConfigCache(): void {
  cachedConfig = null;
  cachedFlags = null;
}