import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import type { KeywordIdeaItem } from "./types";

const API_BASE = "https://googleads.googleapis.com/v19";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REQUEST_TIMEOUT_MS = 30_000;
// Retry idempotent reads on transient 5xx; 429/403 quota errors are NOT
// retried (Google Ads quota resets on long windows, retrying just burns time).
const MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = 250;

const REQUIRED_ENV = [
  "GOOGLE_ADS_CLIENT_ID",
  "GOOGLE_ADS_CLIENT_SECRET",
  "GOOGLE_ADS_REFRESH_TOKEN",
  "GOOGLE_ADS_CUSTOMER_ID",
  "GOOGLE_ADS_DEVELOPER_TOKEN",
] as const;

export async function hasGoogleAdsCredentials(): Promise<boolean> {
  for (const name of REQUIRED_ENV) {
    if (!(await getOptionalEnvValue(name))) return false;
  }
  return true;
}

/** LOW/MEDIUM/HIGH buckets → the app's 0-1 competition ratio. */
export const COMPETITION_RATIO: Record<string, number> = {
  LOW: 0.25,
  MEDIUM: 0.5,
  HIGH: 0.85,
};

type GoogleAdsTokenResponse = {
  access_token?: string;
  expires_in?: number;
};

type MonthlySearchVolumes = Array<{
  year?: string | number;
  month?: string | number;
  monthlySearches?: string | number;
}>;

type GoogleAdsKeywordMetrics = {
  keyword: string;
  avgMonthlySearches: number | null;
  competition: "LOW" | "MEDIUM" | "HIGH" | "UNSPECIFIED" | "UNKNOWN";
  monthlySearchVolumes?: MonthlySearchVolumes;
};

type GenerateKeywordIdeasResponse = {
  results?: Array<{
    text?: string;
    keywordPlanMetrics?: {
      avgMonthlySearches?: string | number;
      competition?: GoogleAdsKeywordMetrics["competition"];
      monthlySearchVolumes?: MonthlySearchVolumes;
    };
  }>;
};

type HistoricalMetricsResponse = {
  results?: Array<{
    text?: string;
    keywordMetrics?: {
      avgMonthlySearches?: string | number;
      competition?: GoogleAdsKeywordMetrics["competition"];
      monthlySearchVolumes?: MonthlySearchVolumes;
    };
  }>;
};

export class GoogleAdsProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GoogleAdsProviderError";
  }
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const [clientId, clientSecret, refreshToken] = await Promise.all([
    getOptionalEnvValue("GOOGLE_ADS_CLIENT_ID"),
    getOptionalEnvValue("GOOGLE_ADS_CLIENT_SECRET"),
    getOptionalEnvValue("GOOGLE_ADS_REFRESH_TOKEN"),
  ]);

  if (!clientId || !clientSecret || !refreshToken) {
    throw new GoogleAdsProviderError(
      "Google Ads credentials are not configured",
    );
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new GoogleAdsProviderError(
      `Google Ads token refresh failed with HTTP ${response.status}`,
      response.status,
    );
  }

  const token = (await response.json()) as GoogleAdsTokenResponse;
  if (!token.access_token) {
    throw new GoogleAdsProviderError(
      "Google Ads token response missing access_token",
    );
  }

  cachedToken = {
    token: token.access_token,
    // Refresh tokens mint access tokens that last 1h; re-mint at 45m.
    expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000 * 0.75,
  };
  return cachedToken.token;
}

function geoTargetConstant(locationCode: number): string {
  return String(locationCode);
}

function toNumber(value: string | number | undefined | null): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapMetrics(
  keyword: string,
  metrics: {
    avgMonthlySearches?: string | number;
    competition?: GoogleAdsKeywordMetrics["competition"];
    monthlySearchVolumes?: MonthlySearchVolumes;
  },
): GoogleAdsKeywordMetrics {
  return {
    keyword,
    avgMonthlySearches: toNumber(metrics.avgMonthlySearches),
    competition: metrics.competition ?? "UNKNOWN",
    monthlySearchVolumes: metrics.monthlySearchVolumes,
  };
}

async function adsRequest<T>(
  customerId: string,
  method: string,
  body: unknown,
): Promise<T> {
  const accessToken = await getAccessToken();
  const url = `${API_BASE}/customers/${customerId.replace(/\D/g, "")}/googleAds:${method}`;

  let lastError: GoogleAdsProviderError | null = null;
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "developer-token":
            (await getOptionalEnvValue("GOOGLE_ADS_DEVELOPER_TOKEN")) ?? "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (response.ok) {
        return (await response.json()) as T;
      }
      lastError = new GoogleAdsProviderError(
        `${method} failed with HTTP ${response.status}`,
        response.status,
      );
      const retriable = response.status >= 500 && attempt < MAX_RETRIES;
      if (!retriable) throw lastError;
    } catch (error) {
      if (error instanceof GoogleAdsProviderError) {
        lastError = error;
        if (
          error.status == null ||
          error.status < 500 ||
          attempt >= MAX_RETRIES
        ) {
          throw error;
        }
      } else {
        throw error;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS * (attempt + 1)));
  }
}

export async function generateKeywordIdeas(input: {
  customerId: string;
  seedKeyword: string;
  locationCode: number;
  languageCode: string;
  pageSize: number;
}): Promise<GoogleAdsKeywordMetrics[]> {
  const payload = await adsRequest<GenerateKeywordIdeasResponse>(
    input.customerId,
    "generateKeywordIdeas",
    {
      keywordSeed: { keywords: [input.seedKeyword] },
      geoTargetConstants: [
        `geoTargetConstants/${geoTargetConstant(input.locationCode)}`,
      ],
      language: `languageConstants/${input.languageCode}`,
      pageSize: input.pageSize,
    },
  );

  const rows: GoogleAdsKeywordMetrics[] = [];
  for (const result of payload.results ?? []) {
    if (!result.text) continue;
    rows.push(mapMetrics(result.text, result.keywordPlanMetrics ?? {}));
  }
  return rows;
}

export async function fetchHistoricalMetrics(input: {
  customerId: string;
  keywords: string[];
  locationCode: number;
  languageCode: string;
}): Promise<GoogleAdsKeywordMetrics[]> {
  const payload = await adsRequest<HistoricalMetricsResponse>(
    input.customerId,
    "generateKeywordHistoricalMetrics",
    {
      keywords: input.keywords,
      geoTargetConstants: [
        `geoTargetConstants/${geoTargetConstant(input.locationCode)}`,
      ],
      language: `languageConstants/${input.languageCode}`,
    },
  );

  const rows: GoogleAdsKeywordMetrics[] = [];
  for (const result of payload.results ?? []) {
    if (!result.text) continue;
    rows.push(mapMetrics(result.text, result.keywordMetrics ?? {}));
  }
  return rows;
}

/**
 * DataForSEO language codes are ISO-639-1 strings ("en"); Google Ads language
 * constants use fixed IDs. Unknown codes fall back to English.
 */
const LANGUAGE_CONSTANTS: Record<string, string> = {
  en: "1000",
  es: "1003",
  de: "1001",
  fr: "1002",
  it: "1004",
  pt: "1018",
  nl: "1014",
  ja: "1005",
  zh: "1016",
  ru: "1021",
};

export function languageConstantFor(languageCode: string): string {
  const base = languageCode.toLowerCase().split("-")[0] ?? "en";
  return LANGUAGE_CONSTANTS[base] ?? LANGUAGE_CONSTANTS.en!;
}

/** Provider-neutral idea rows for the keyword research pipeline. */
export async function fetchGoogleAdsKeywordIdeas(input: {
  keyword: string;
  locationCode: number;
  languageCode: string;
  limit: number;
}): Promise<KeywordIdeaItem[]> {
  const customerId = await getOptionalEnvValue("GOOGLE_ADS_CUSTOMER_ID");
  if (!customerId) {
    throw new GoogleAdsProviderError(
      "Google Ads credentials are not configured",
    );
  }

  const metrics = await generateKeywordIdeas({
    customerId,
    seedKeyword: input.keyword,
    locationCode: input.locationCode,
    languageCode: languageConstantFor(input.languageCode),
    pageSize: Math.min(input.limit, 100),
  });

  return metrics.map((metric) => ({
    keyword: metric.keyword,
    searchVolume: metric.avgMonthlySearches,
    cpc: null,
    competition:
      metric.competition !== "UNKNOWN" && metric.competition !== "UNSPECIFIED"
        ? (COMPETITION_RATIO[metric.competition] ?? null)
        : null,
    monthlySearches: (metric.monthlySearchVolumes ?? []).map((entry) => ({
      year: Number(entry.year ?? 0),
      month: Number(entry.month ?? 0),
      searchVolume: Number(entry.monthlySearches ?? 0),
    })),
  }));
}

/** Provider-neutral volume rows for an explicit keyword list. */
export async function fetchGoogleAdsMetricsForList(input: {
  keywords: string[];
  locationCode: number;
  languageCode: string;
}): Promise<KeywordIdeaItem[]> {
  const customerId = await getOptionalEnvValue("GOOGLE_ADS_CUSTOMER_ID");
  if (!customerId) {
    throw new GoogleAdsProviderError(
      "Google Ads credentials are not configured",
    );
  }

  const metrics = await fetchHistoricalMetrics({
    customerId,
    keywords: input.keywords,
    locationCode: input.locationCode,
    languageCode: languageConstantFor(input.languageCode),
  });

  return metrics.map((metric) => ({
    keyword: metric.keyword,
    searchVolume: metric.avgMonthlySearches,
    cpc: null,
    competition:
      metric.competition !== "UNKNOWN" && metric.competition !== "UNSPECIFIED"
        ? (COMPETITION_RATIO[metric.competition] ?? null)
        : null,
    monthlySearches: (metric.monthlySearchVolumes ?? []).map((entry) => ({
      year: Number(entry.year ?? 0),
      month: Number(entry.month ?? 0),
      searchVolume: Number(entry.monthlySearches ?? 0),
    })),
  }));
}
