import type { EnrichedKeyword } from "@/server/features/keywords/services/research/helpers";
import { normalizeKeyword } from "@/server/features/keywords/services/research/helpers";
import {
  generateKeywordIdeas,
  fetchHistoricalMetrics,
} from "@/server/lib/keyword-providers/google-ads";

type ProviderInput = {
  seedKeyword: string;
  locationCode: number;
  languageCode: string;
  resultLimit: number;
};

function competitionToRatio(
  competition: "LOW" | "MEDIUM" | "HIGH" | "UNSPECIFIED" | "UNKNOWN",
): number | null {
  switch (competition) {
    case "LOW":
      return 0.25;
    case "MEDIUM":
      return 0.5;
    case "HIGH":
      return 0.85;
    default:
      return null;
  }
}

function toEnriched(
  metrics: { keyword: string; avgMonthlySearches: number | null; competition: "LOW" | "MEDIUM" | "HIGH" | "UNSPECIFIED" | "UNKNOWN" },
): EnrichedKeyword {
  return {
    keyword: normalizeKeyword(metrics.keyword),
    searchVolume: metrics.avgMonthlySearches,
    trend: [],
    cpc: null,
    competition: competitionToRatio(metrics.competition),
    keywordDifficulty: null,
    intent: "unknown",
  };
}

function dedupe(rows: EnrichedKeyword[]): EnrichedKeyword[] {
  const seen = new Set<string>();
  const out: EnrichedKeyword[] = [];
  for (const row of rows) {
    if (seen.has(row.keyword)) continue;
    seen.add(row.keyword);
    out.push(row);
  }
  return out;
}

async function getCustomerId(): Promise<string> {
  const { getOptionalEnvValue } = await import("@/server/lib/runtime-env");
  const customerId = await getOptionalEnvValue("GOOGLE_ADS_CUSTOMER_ID");
  if (!customerId) {
    throw new Error("Missing required environment variable: GOOGLE_ADS_CUSTOMER_ID");
  }
  return customerId;
}

/** Seed-based expansion (related / suggestions / ideas all funnel here). */
export async function fetchGoogleAdsResearchRows(
  params: ProviderInput,
): Promise<EnrichedKeyword[]> {
  const customerId = await getCustomerId();
  const metrics = await generateKeywordIdeas({
    customerId,
    seedKeyword: params.seedKeyword,
    locationCode: params.locationCode,
    languageCode: params.languageCode,
    pageSize: params.resultLimit,
  });

  return dedupe(metrics.map(toEnriched)).slice(0, params.resultLimit);
}

/** Volume refresh for an explicit keyword list (saved-keyword refresh). */
export async function fetchGoogleAdsMetricsForList(
  keywords: string[],
  locationCode: number,
  languageCode: string,
): Promise<EnrichedKeyword[]> {
  const customerId = await getCustomerId();
  const metrics = await fetchHistoricalMetrics({
    customerId,
    keywords,
    locationCode,
    languageCode,
  });

  return metrics.map(toEnriched);
}
