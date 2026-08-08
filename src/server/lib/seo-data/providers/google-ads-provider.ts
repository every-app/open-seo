import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import type { SEODataProvider, SEODataRequest } from "../types";
import {
  ProviderUnsupportedError,
  ProviderUnavailableError,
  AuthenticationError,
  RateLimitError,
} from "../errors";
import { getProviderFeatureFlags } from "../config";

/**
 * Google Ads Keyword Planner provider — free keyword research and historical
 * search volume via the official Google Ads API.
 *
 * Serves `keyword_ideas` and `keyword_metrics` data types. Uses the Google Ads
 * API's KeywordPlanningService for keyword idea generation and
 * historical_metrics for search volume data.
 *
 * Authentication uses a developer token + OAuth refresh token (service-account
 * compatible). Credentials are read from env and never logged.
 *
 * If credentials are unavailable, the provider returns a structured
 * `ProviderUnavailableError` and the router falls back to the next provider.
 */

const GOOGLE_ADS_API_BASE = "https://googleads.googleapis.com";
const GOOGLE_ADS_API_VERSION = "v18";

type GoogleAdsConfig = {
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  customerId: string;
};

let cachedConfig: GoogleAdsConfig | null | undefined;

async function loadConfig(): Promise<GoogleAdsConfig | null> {
  if (cachedConfig !== undefined) return cachedConfig;

  const [developerToken, clientId, clientSecret, refreshToken, customerId] =
    await Promise.all([
      getOptionalEnvValue("GOOGLE_ADS_DEVELOPER_TOKEN"),
      getOptionalEnvValue("GOOGLE_ADS_CLIENT_ID"),
      getOptionalEnvValue("GOOGLE_ADS_CLIENT_SECRET"),
      getOptionalEnvValue("GOOGLE_ADS_REFRESH_TOKEN"),
      getOptionalEnvValue("GOOGLE_ADS_CUSTOMER_ID"),
    ]);

  cachedConfig =
    developerToken && clientId && clientSecret && refreshToken && customerId
      ? {
          developerToken,
          clientId,
          clientSecret,
          refreshToken,
          customerId,
        }
      : null;
  return cachedConfig;
}

async function getAccessToken(): Promise<string> {
  const config = await loadConfig();
  if (!config) {
    throw new ProviderUnavailableError(
      "google_ads",
      "Google Ads credentials not configured",
    );
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new AuthenticationError("google_ads", "Invalid Google Ads credentials");
    }
    if (response.status === 429) {
      throw new RateLimitError("google_ads", "Google Ads token endpoint rate limited");
    }
    throw new ProviderUnavailableError(
      "google_ads",
      `Google Ads token request failed: ${response.status}`,
    );
  }

  const data = (await response.json()) as { access_token?: string }; // oxlint-disable-line typescript/no-unnecessary-type-assertion -- response.json() returns unknown
  if (!data.access_token) {
    throw new AuthenticationError("google_ads", "No access token in response");
  }
  return data.access_token;
}

async function googleAdsRequest<T>(
  path: string,
  body: unknown,
): Promise<T> {
  const config = await loadConfig();
  if (!config) {
    throw new ProviderUnavailableError(
      "google_ads",
      "Google Ads credentials not configured",
    );
  }

  const token = await getAccessToken();
  const url = `${GOOGLE_ADS_API_BASE}/${GOOGLE_ADS_API_VERSION}/customers/${config.customerId}/${path}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "developer-token": config.developerToken,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) {
      throw new AuthenticationError(
        "google_ads",
        `Google Ads auth failed: ${response.status}`,
      );
    }
    if (response.status === 429) {
      throw new RateLimitError("google_ads", "Google Ads rate limit reached");
    }
    throw new ProviderUnavailableError(
      "google_ads",
      `Google Ads API error ${response.status}: ${errorBody.slice(0, 200)}`,
    );
  }

  return (await response.json()) as T;
}

/**
 * Generate keyword ideas from a seed keyword using Google Ads
 * KeywordPlanningService.GenerateKeywordIdeas.
 */
async function generateKeywordIdeas(
  request: SEODataRequest,
): Promise<unknown> {
  const config = await loadConfig();
  if (!config) throw new ProviderUnavailableError("google_ads");

  if (!request.keyword) {
    throw new ProviderUnsupportedError(
      "google_ads",
      request.dataType,
      "keyword_ideas requires a seed keyword",
    );
  }

  return googleAdsRequest("keywordPlanIdeas:generate", {
    keywordSeed: { keywords: [request.keyword] },
    geoTargetConstants: request.locationCode
      ? [`geoTargetConstants/${request.locationCode}`]
      : [],
    language:
      request.languageCode ?? "languageConstants/1000", // 1000 = English
    includeAdultKeywords: false,
  });
}

/**
 * Get historical search volume for a list of keywords using Google Ads
 * KeywordPlanningService.GenerateHistoricalMetrics.
 */
async function getHistoricalMetrics(
  request: SEODataRequest,
): Promise<unknown> {
  const config = await loadConfig();
  if (!config) throw new ProviderUnavailableError("google_ads");

  const keywords = request.keywords ?? (request.keyword ? [request.keyword] : []);
  if (keywords.length === 0) {
    throw new ProviderUnsupportedError(
      "google_ads",
      request.dataType,
      "keyword_metrics requires keywords",
    );
  }

  return googleAdsRequest("keywordPlanKeywords:generateHistoricalMetrics", {
    keywords: keywords.map((kw) => ({
      text: kw,
      matchType: "EXACT",
    })),
  });
}

export function createGoogleAdsProvider(): SEODataProvider {
  return {
    name: "google_ads",

    supports(request: SEODataRequest): boolean {
      return (
        request.dataType === "keyword_ideas" ||
        request.dataType === "keyword_metrics"
      );
    },

    async get(request: SEODataRequest): Promise<unknown> {
      const flags = await getProviderFeatureFlags();
      if (!flags.googleAdsEnabled) {
        throw new ProviderUnavailableError(
          "google_ads",
          "Google Ads is not enabled (GOOGLE_ADS_ENABLED=false)",
        );
      }

      const config = await loadConfig();
      if (!config) {
        throw new ProviderUnavailableError(
          "google_ads",
          "Google Ads credentials not configured",
        );
      }

      switch (request.dataType) {
        case "keyword_ideas":
          return generateKeywordIdeas(request);
        case "keyword_metrics":
          return getHistoricalMetrics(request);
        default:
          throw new ProviderUnsupportedError(
            "google_ads",
            request.dataType,
          );
      }
    },
  };
}