import { passthroughSchema } from "./cache-service";
import { SeoCacheService } from "./cache-service";
import { singleFlight } from "./single-flight";
import {
  isDataforseoBudgetAvailable,
  recordCacheHit,
  recordCacheMiss,
  recordDataforseoCall,
  recordFreeProviderCall,
  logRequest,
} from "./cost-tracker";
import {
  BudgetExceededError,
  ProviderUnavailableError,
  ProviderUnsupportedError,
} from "./errors";
import { getProviderFeatureFlags } from "./config";
import type {
  SEODataProvider,
  SEODataRequest,
  SEODataResponse,
  SEODataType,
} from "./types";
import type { ZodTypeAny } from "zod";

/**
 * The priority order of providers for each data type. The first provider that
 * `supports()` the request and is enabled (feature flag) is tried first.
 * DataForSEO is always the last entry (the paid fallback).
 *
 * This is the deterministic provider routing policy.
 */
const PROVIDER_PRIORITY: Record<SEODataType, string[]> = {
  keyword_ideas: ["google_ads", "internal", "dataforseo"],
  keyword_metrics: ["google_ads", "internal", "dataforseo"],
  serp: ["internal", "dataforseo"],
  domain_keywords: ["internal", "dataforseo"],
  domain_overview: ["internal", "dataforseo"],
  domain_pages: ["internal", "dataforseo"],
  competitors: ["internal", "dataforseo"],
  backlinks: ["internal", "dataforseo"],
  site_audit: ["local_crawler", "dataforseo"],
  search_console: ["gsc"],
  bing_search_performance: ["bing_webmaster"],
};

/**
 * The central data router. Every SEO data request goes through this layer.
 *
 * Flow:
 * 1. Check cache → return on hit
 * 2. Try free/internal providers in priority order
 * 3. Fall back to DataForSEO (paid) if no free provider succeeds
 * 4. Cache the result
 * 5. Log structured request entry
 *
 * Provider selection logic lives here and nowhere else.
 */
export class DataRouter {
  private providers: Map<string, SEODataProvider> = new Map();

  /** Register a provider by its `name`. */
  register(provider: SEODataProvider): void {
    this.providers.set(provider.name, provider);
  }

  /**
   * Route a data request through cache → free providers → DataForSEO fallback.
   * Returns a structured response with provider/cache metadata.
   */
  async route<T = unknown>(
    request: SEODataRequest,
    schema: ZodTypeAny = passthroughSchema,
  ): Promise<SEODataResponse<T>> {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const flags = await getProviderFeatureFlags();

    // If the router is disabled, find the DataForSEO provider and call it
    // directly (backward compatibility with the pre-router behavior).
    if (!flags.routerEnabled) {
      const dfs = this.providers.get("dataforseo");
      if (dfs && dfs.supports(request)) {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- provider returns unknown; caller types it
        const data = (await dfs.get(request)) as T;
        return {
          dataType: request.dataType,
          provider: "dataforseo",
          data,
          fromCache: false,
          durationMs: Date.now() - startTime,
        };
      }
    }

    // 1. Cache check
    const cacheResult = await SeoCacheService.getOrFetch<T>(
      request,
      schema,
      async (cacheKey) => {
        // 2. Try providers in priority order
        const priority = PROVIDER_PRIORITY[request.dataType] ?? [];
        let lastError: unknown = null;

        for (const providerName of priority) {
          // Skip disabled providers
          if (!isProviderEnabled(providerName, flags)) continue;

          const provider = this.providers.get(providerName);
          if (!provider) continue;
          if (!provider.supports(request)) continue;

          try {
            const data = await singleFlight(cacheKey, () =>
              provider.get(request),
            );

            if (providerName !== "dataforseo") {
              recordFreeProviderCall(providerName);
            }

            // Cache the result (fire-and-forget is the caller's job via
            // waitUntil; here we await to ensure persistence within the
            // request lifecycle).
            await SeoCacheService.set(request, cacheKey, data);

            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- provider returns unknown; caller types it
            return data as T;
          } catch (error) {
            if (error instanceof ProviderUnsupportedError) {
              // Expected — try the next provider
              continue;
            }
            if (error instanceof ProviderUnavailableError) {
              // Expected — try the next provider, record reason
              if (providerName !== "dataforseo") {
                // Intentionally unused; the log entry below captures the outcome
              }
              lastError = error;
              continue;
            }
            if (error instanceof BudgetExceededError) {
              // Budget exceeded — do NOT try DataForSEO, return structured error
              logRequest({
                requestId,
                dataType: request.dataType,
                provider: providerName,
                cacheStatus: "miss",
                fallback: false,
                fallbackReason: "budget_exceeded",
                durationMs: Date.now() - startTime,
                success: false,
              });
              throw error;
            }
            // Unexpected error — record and try next provider
            lastError = error;
            continue;
          }
        }

        // No provider succeeded
        if (lastError) {
          throw lastError;
        }
        throw new ProviderUnavailableError(
          "router",
          `No provider available for ${request.dataType}`,
        );
      },
    );

    if (cacheResult.fromCache) {
      recordCacheHit();
    } else {
      recordCacheMiss();
    }

    const response: SEODataResponse<T> = {
      dataType: request.dataType,
      provider: cacheResult.fromCache ? "cache" : "provider",
      data: cacheResult.data,
      fromCache: cacheResult.fromCache,
      durationMs: Date.now() - startTime,
    };

    logRequest({
      requestId,
      dataType: request.dataType,
      provider: cacheResult.fromCache ? "cache" : "provider",
      cacheStatus: cacheResult.fromCache ? "hit" : "miss",
      fallback: !cacheResult.fromCache,
      durationMs: response.durationMs,
      success: true,
    });

    return response;
  }
}

function isProviderEnabled(
  name: string,
  flags: Awaited<ReturnType<typeof getProviderFeatureFlags>>,
): boolean {
  switch (name) {
    case "dataforseo":
      return flags.dataforseoEnabled;
    case "gsc":
      return flags.gscEnabled;
    case "google_ads":
      return flags.googleAdsEnabled;
    case "bing_webmaster":
      return flags.bingWebmasterEnabled;
    case "local_crawler":
      return flags.localCrawlerEnabled;
    case "internal":
      return true; // internal DB reads are always enabled
    default:
      return true;
  }
}

/**
 * Budget-guarded DataForSEO call wrapper. Used by the DataForSEO provider
 * implementation to enforce daily/monthly budget limits before making a call.
 */
export async function withBudgetGuard<T>(
  fn: () => Promise<T>,
): Promise<T> {
  const available = await isDataforseoBudgetAvailable();
  if (!available) {
    throw new BudgetExceededError("daily", 0, 0);
  }
  return fn();
}

export { recordDataforseoCall };