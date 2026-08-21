import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { AppError } from "@/server/lib/errors";
import {
  type SerpLiveItem,
  type SerpLiveInput,
  type SerpProvider,
} from "./providers/base";
import { SerperProvider } from "./providers/serper";

// ---------------------------------------------------------------------------
// Known providers registry — keyed by SERP_PROVIDER env value.
// Add one entry per supported external provider.
// ---------------------------------------------------------------------------

const PROVIDERS: Record<string, SerpProvider> = {
  serper: new SerperProvider(),
};

/** Valid values for the SERP_PROVIDER environment variable. */
const KNOWN_SERP_PROVIDERS = Object.keys(PROVIDERS); // ["serper"]
/** When no explicit provider, dataforseo is the default. */
const DEFAULT_PROVIDER = "dataforseo";

// ---------------------------------------------------------------------------
// Unified lookup: resolves the right provider name and instance
// based on SERP_PROVIDER / SERP_FALLBACK env vars.
// ---------------------------------------------------------------------------

let providerCache: string | null = null;
let providerInstance: SerpProvider | null = null;

export async function getProvider(): Promise<SerpProvider> {
  if (providerCache && providerInstance) return providerInstance;

  const raw = await import("@/server/lib/runtime-env").then(
    (m) => m.getOptionalEnvValue("SERP_PROVIDER"),
  );

  const candidate = (raw ?? "").trim().toLowerCase();

  if (candidate === "dataforseo" || candidate === "") {
    // Default — callers will hit createDataforseoClient() directly.
    providerCache = DEFAULT_PROVIDER;
    providerInstance = null;
    return Promise.resolve(null as unknown as SerpProvider);
  }

  if (candidate in PROVIDERS) {
    providerCache = candidate;
    providerInstance = PROVIDERS[candidate];
    return providerInstance;
  }

  // Check fallback chain
  const fallbackRaw = await import("@/server/lib/runtime-env").then(
    (m) => m.getOptionalEnvValue("SERP_FALLBACK"),
  );
  if (fallbackRaw) {
    const fallbacks = fallbackRaw.split(",").map((s) => s.trim().toLowerCase());
    for (const name of fallbacks) {
      if (name === "dataforseo") continue; // handled separately
      if (name in PROVIDERS) {
        providerCache = name;
        providerInstance = PROVIDERS[name];
        return providerInstance;
      }
    }
  }

  throw new AppError(
    "VALIDATION_ERROR",
    `Unknown SERP_PROVIDER="${candidate}". Must be one of: ${KNOWN_SERP_PROVIDERS.join(", ")} or "${DEFAULT_PROVIDER}".`,
  );
}

/**
 * Fetch SERP results through the configured provider.
 *
 * @param input   Keyword + optional location/language
 * @param billing When provided AND provider is dataforseo, routes through
 *                the metered DataForSEO client. Omit for external providers
 *                (they do not carry billing credits).
 */
export async function getSerpResults(
  input: SerpLiveInput,
  billing?: BillingCustomerContext,
): Promise<SerpLiveItem[]> {
  const provider = await getProvider();

  if (!provider) {
    // Route through DataForSEO with billing
    if (!billing) {
      throw new AppError(
        "VALIDATION_ERROR",
        "SERP_PROVIDER=dataforseo requires a billing context.",
      );
    }
    // DataForSEO's live() requires non-optional locationCode/languageCode —
    // fill defaults so we can pass through.  The MCP tool and keywords SERP
    // service already supply these fields, but the adapter type keeps them
    // optional for future providers that tolerate missing values gracefully.
    const dfInput = {
      keyword: input.keyword,
      locationCode: input.locationCode ?? 2840, // US default
      languageCode: input.languageCode ?? "en",
    };
    const client = createDataforseoClient(billing);
    return client.serp.live(dfInput);
  }

  // External provider — no billing wrapper
  return provider.liveSerp(input);
}
