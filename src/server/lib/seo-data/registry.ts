import { DataRouter } from "./data-router";
import { createDataforseoProvider } from "./providers/dataforseo-provider";
import { createGscProvider } from "./providers/gsc-provider";
import { createGoogleAdsProvider } from "./providers/google-ads-provider";
import { createBingWebmasterProvider } from "./providers/bing-webmaster-provider";
import { createLocalCrawlerProvider } from "./providers/local-crawler-provider";
import { createInternalProvider } from "./providers/internal-provider";

/**
 * Singleton DataRouter with all providers registered.
 *
 * Provider priority is determined by the DataRouter's PROVIDER_PRIORITY map,
 * not by registration order. Registration just makes providers available to
 * the router.
 */
let singleton: DataRouter | null = null;

export function getSeoDataRouter(): DataRouter {
  if (singleton) return singleton;

  singleton = new DataRouter();

  // Register all providers. The DataRouter checks feature flags at runtime,
  // so disabled providers are simply never tried.
  singleton.register(createDataforseoProvider());
  singleton.register(createGscProvider());
  singleton.register(createGoogleAdsProvider());
  singleton.register(createBingWebmasterProvider());
  singleton.register(createLocalCrawlerProvider());
  singleton.register(createInternalProvider());

  return singleton;
}

/**
 * Reset the singleton — used by tests.
 */
export function resetSeoDataRouter(): void {
  singleton = null;
}