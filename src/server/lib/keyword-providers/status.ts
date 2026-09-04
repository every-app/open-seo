import { AppError } from "@/server/lib/errors";
import type { ErrorCode } from "@/shared/error-codes";
import { hasBingCredentials } from "./bing";
import { hasGoogleAdsCredentials } from "./google-ads";

type ProviderStatus = {
  googleAds: boolean;
  bing: boolean;
};

let cachedStatus: ProviderStatus | null = null;

export async function getKeywordProviderStatus(): Promise<ProviderStatus> {
  if (cachedStatus) return cachedStatus;
  const [googleAds, bing] = await Promise.all([
    hasGoogleAdsCredentials(),
    hasBingCredentials(),
  ]);
  cachedStatus = { googleAds, bing };
  return cachedStatus;
}

export function resetKeywordProviderStatusCache(): void {
  cachedStatus = null;
}

/**
 * Maps a provider transport failure to a product AppError. Falls back to
 * UPSTREAM_UNAVAILABLE when the provider doesn't map to a specific code.
 */
export function providerError(
  provider: "google_ads" | "bing",
  error: unknown,
): AppError {
  const message = error instanceof Error ? error.message : String(error);
  let code: ErrorCode = "UPSTREAM_UNAVAILABLE";
  if (message.includes("not configured") || message.includes("credentials")) {
    code = "DATAFORSEO_AUTH_FAILED";
  } else if (/\(429\)/.test(message)) {
    code = "RATE_LIMITED";
  }
  return new AppError(code, `${provider}: ${message}`);
}
