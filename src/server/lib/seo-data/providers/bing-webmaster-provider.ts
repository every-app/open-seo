import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import type { SEODataProvider, SEODataRequest } from "../types";
import {
  ProviderUnsupportedError,
  ProviderUnavailableError,
  AuthenticationError,
} from "../errors";
import { getProviderFeatureFlags } from "../config";

/**
 * Bing Webmaster provider — free first-party search performance data.
 *
 * Serves `bing_search_performance` data type for verified/authorized sites.
 * Uses the Bing Webmaster API (https://api.bingwebmaster.com/v3).
 *
 * If the API cannot support a requested operation, returns a structured
 * `ProviderUnsupportedError` instead of throwing an uncontrolled exception.
 */

const BING_WEBMASTER_API_BASE = "https://api.bingwebmaster.com/v3";

type BingConfig = {
  apiKey: string;
};

let cachedConfig: BingConfig | null | undefined;

async function loadConfig(): Promise<BingConfig | null> {
  if (cachedConfig !== undefined) return cachedConfig;

  const apiKey = await getOptionalEnvValue("BING_WEBMASTER_API_KEY");
  cachedConfig = apiKey ? { apiKey } : null;
  return cachedConfig;
}

async function bingRequest<T>(path: string): Promise<T> {
  const config = await loadConfig();
  if (!config) {
    throw new ProviderUnavailableError(
      "bing_webmaster",
      "Bing Webmaster API key not configured",
    );
  }

  const url = `${BING_WEBMASTER_API_BASE}${path}&apikey=${encodeURIComponent(config.apiKey)}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new AuthenticationError(
        "bing_webmaster",
        `Bing Webmaster auth failed: ${response.status}`,
      );
    }
    if (response.status === 404) {
      throw new ProviderUnsupportedError(
        "bing_webmaster",
        "bing_search_performance",
        "Site not found in Bing Webmaster",
      );
    }
    throw new ProviderUnavailableError(
      "bing_webmaster",
      `Bing Webmaster API error: ${response.status}`,
    );
  }

  return (await response.json()) as T;
}

export function createBingWebmasterProvider(): SEODataProvider {
  return {
    name: "bing_webmaster",

    supports(request: SEODataRequest): boolean {
      return request.dataType === "bing_search_performance";
    },

    async get(request: SEODataRequest): Promise<unknown> {
      const flags = await getProviderFeatureFlags();
      if (!flags.bingWebmasterEnabled) {
        throw new ProviderUnavailableError(
          "bing_webmaster",
          "Bing Webmaster is not enabled (BING_WEBMASTER_ENABLED=false)",
        );
      }

      const config = await loadConfig();
      if (!config) {
        throw new ProviderUnavailableError(
          "bing_webmaster",
          "Bing Webmaster API key not configured",
        );
      }

      const siteUrl =
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- optional string from constraints
        request.constraints?.siteUrl as string | undefined;
      if (!siteUrl) {
        throw new ProviderUnsupportedError(
          "bing_webmaster",
          request.dataType,
          "Bing Webmaster provider requires siteUrl in constraints",
        );
      }

      // Bing Webmaster QueryStats API
      const dateFrom = request.dateFrom ?? "1970-01-01";
      const dateTo = request.dateTo ?? new Date().toISOString().slice(0, 10);
      const path = `/stats/querystats?siteUrl=${encodeURIComponent(siteUrl)}&date=${dateFrom}&endDate=${dateTo}`;

      try {
        const data = await bingRequest(path);
        return data;
      } catch (error) {
        if (error instanceof ProviderUnsupportedError) throw error;
        if (error instanceof ProviderUnavailableError) throw error;
        if (error instanceof AuthenticationError) throw error;
        throw new ProviderUnavailableError(
          "bing_webmaster",
          `Bing Webmaster request failed: ${error instanceof Error ? error.message : "unknown"}`,
          error,
        );
      }
    },
  };
}