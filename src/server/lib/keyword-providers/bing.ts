import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { bingCountryForLocationCode } from "./countries";
import type { KeywordIdeaItem } from "./types";

export const BING_ENV = {
  apiKey: "BING_WEBMASTER_API_KEY",
} as const;

const BING_API_BASE = "https://ssl.bing.com/webmaster/api.svc/json";
const REQUEST_TIMEOUT_MS = 20_000;

export async function hasBingCredentials(): Promise<boolean> {
  return Boolean(await getOptionalEnvValue(BING_ENV.apiKey));
}

/** LOW/MEDIUM/HIGH buckets → the app's 0-1 competition ratio. */
const COMPETITION_RATIO: Record<string, number> = {
  LOW: 0.25,
  MEDIUM: 0.5,
  HIGH: 0.75,
};

type BingStatsResponse = {
  d?: Record<
    string,
    {
      K?: string | null;
      C?: number | null; // impressions proxy (search volume)
      P?: number | null; // price (CPC)
      S?: number | null; // content-match competition
    }
  >;
};

type BingIdeasResponse = {
  d?: Array<{
    Keyword?: string | null;
    SearchVolume?: number | null;
    Cpc?: number | null;
    Competition?: string | null;
  }>;
};

export async function bingFetch<T>(
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const apiKey = await getOptionalEnvValue(BING_ENV.apiKey);
  if (!apiKey) {
    throw new Error("Bing Webmaster API key is not configured");
  }

  const url = new URL(`${BING_API_BASE}${path}`);
  url.searchParams.set("apikey", apiKey);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Bing Webmaster ${path} failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export type BingKeywordRow = {
  keyword: string;
  searchVolume: number | null;
  cpc: number | null;
  competition: number | null;
};

export async function fetchBingKeywordData(input: {
  seedKeyword: string;
  languageCode: string;
  locationCode?: number;
  resultLimit: number;
}): Promise<BingKeywordRow[]> {
  const payload = await bingFetch<BingStatsResponse>("/GetKeywordStats", {
    q: input.seedKeyword,
    language: input.languageCode,
    country: bingCountryForLocationCode(input.locationCode),
  });

  return Object.entries(payload.d ?? {})
    .map(([keyword, entry]) => ({
      keyword,
      searchVolume: entry?.C ?? null,
      cpc: entry?.P ?? null,
      competition: entry?.S != null ? Math.min(entry.S / 100, 1) : null,
    }))
    .slice(0, input.resultLimit);
}

export async function fetchBingKeywordIdeas(input: {
  keyword: string;
  languageCode: string;
  locationCode?: number;
  limit: number;
}): Promise<BingKeywordRow[]> {
  const payload = await bingFetch<BingIdeasResponse>("/GetKeywordIdeas", {
    q: input.keyword,
    language: input.languageCode,
    country: bingCountryForLocationCode(input.locationCode),
  });

  return (payload.d ?? [])
    .filter((item): item is NonNullable<typeof item> => item != null)
    .map((item) => ({
      keyword: item.Keyword ?? "",
      searchVolume: item.SearchVolume ?? null,
      cpc: item.Cpc ?? null,
      competition: item.Competition
        ? (COMPETITION_RATIO[item.Competition.toUpperCase()] ?? null)
        : null,
    }))
    .filter((row) => row.keyword.length > 0)
    .slice(0, input.limit);
}

/** Provider-neutral idea rows for the keyword research pipeline. */
export async function fetchBingKeywordIdeasAsItems(input: {
  keyword: string;
  languageCode: string;
  locationCode?: number;
  limit: number;
}): Promise<KeywordIdeaItem[]> {
  const rows = await fetchBingKeywordIdeas(input);
  return rows.map((row) => ({
    keyword: row.keyword,
    searchVolume: row.searchVolume,
    cpc: row.cpc,
    competition: row.competition,
    monthlySearches: [],
  }));
}

/** Provider-neutral volume rows for an explicit keyword list. */
export async function fetchBingMetricsForList(input: {
  keywords: string[];
  languageCode: string;
  locationCode?: number;
}): Promise<KeywordIdeaItem[]> {
  // GetKeywordStats accepts one seed per call; query sequentially and merge.
  const out: KeywordIdeaItem[] = [];
  const seen = new Set<string>();
  for (const keyword of input.keywords) {
    const rows = await fetchBingKeywordData({
      seedKeyword: keyword,
      languageCode: input.languageCode,
      locationCode: input.locationCode,
      resultLimit: input.keywords.length,
    });
    for (const row of rows) {
      if (seen.has(row.keyword.toLowerCase())) continue;
      seen.add(row.keyword.toLowerCase());
      out.push({
        keyword: row.keyword,
        searchVolume: row.searchVolume,
        cpc: row.cpc,
        competition: row.competition,
        monthlySearches: [],
      });
    }
  }
  return out;
}
