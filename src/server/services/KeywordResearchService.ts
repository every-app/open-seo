import type {
  KeywordIntent,
  KeywordResearchRow,
  MonthlySearch,
  SavedKeywordRow,
  SerpResultItem,
} from "@/types/keywords";
import type {
  CreateProjectInput,
  DeleteProjectInput,
  GetSavedKeywordsInput,
  RemoveSavedKeywordInput,
  ResearchKeywordsInput,
  SaveKeywordsInput,
} from "@/types/schemas/keywords";
import {
  fetchRelatedKeywordsRaw,
  fetchKeywordSuggestionsRaw,
  fetchKeywordIdeasRaw,
  type LabsKeywordDataItem,
  fetchHistoricalSerpsRaw,
} from "@/server/lib/dataforseo";
import {
  buildCacheKey,
  getCached,
  setCached,
  CACHE_TTL,
} from "@/server/lib/kv-cache";
import { KeywordResearchRepository } from "@/server/repositories/KeywordResearchRepository";
import { AppError } from "@/server/lib/errors";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeKeyword(input: string): string {
  return input.trim().toLowerCase();
}

function normalizeIntent(raw: unknown): KeywordIntent {
  if (typeof raw !== "string") return "unknown";
  const value = raw.toLowerCase();
  if (value.includes("inform")) return "informational";
  if (value.includes("commerc")) return "commercial";
  if (value.includes("transact")) return "transactional";
  if (value.includes("navig")) return "navigational";
  return "unknown";
}

// ---------------------------------------------------------------------------
// DataForSEO fetch helpers
// ---------------------------------------------------------------------------

type EnrichedKeyword = {
  keyword: string;
  searchVolume: number | null;
  trend: MonthlySearch[];
  cpc: number | null;
  competition: number | null;
  keywordDifficulty: number | null;
  intent: KeywordIntent;
};

type KeywordSource = "related" | "suggestions" | "ideas";

function parseMonthlySearches(payload: string | null): MonthlySearch[] {
  if (!payload) return [];
  try {
    return JSON.parse(payload) as MonthlySearch[];
  } catch (error) {
    console.error("keywords.saved.parse-monthly-searches failed:", error);
    return [];
  }
}

async function fetchRelatedKeywordsWithData(
  seedKeyword: string,
  locationCode: number,
  languageCode: string,
  limit: number,
): Promise<EnrichedKeyword[]> {
  // Fetch from API - data is embedded in the response
  const items = await fetchRelatedKeywordsRaw(
    seedKeyword,
    locationCode,
    languageCode,
    limit,
    3, // depth=3 for ~584 keywords
  );

  // Map embedded data directly from the response
  const rows: EnrichedKeyword[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const kw = item.keyword_data?.keyword;
    if (!kw) continue;

    const normalizedKw = normalizeKeyword(kw);
    if (seen.has(normalizedKw)) continue;
    seen.add(normalizedKw);

    // Use clickstream-normalized volume if available, otherwise fall back to regular
    const keywordInfo = item.keyword_data
      ?.keyword_info_normalized_with_clickstream?.search_volume
      ? item.keyword_data?.keyword_info_normalized_with_clickstream
      : item.keyword_data?.keyword_info;

    rows.push({
      keyword: normalizedKw,
      searchVolume: keywordInfo?.search_volume ?? null,
      trend: (keywordInfo?.monthly_searches ?? []).map((m) => ({
        year: m.year,
        month: m.month,
        searchVolume: m.search_volume ?? 0,
      })),
      cpc: item.keyword_data?.keyword_info?.cpc ?? null,
      competition: item.keyword_data?.keyword_info?.competition ?? null,
      keywordDifficulty:
        item.keyword_data?.keyword_properties?.keyword_difficulty ?? null,
      intent: normalizeIntent(
        item.keyword_data?.search_intent_info?.main_intent,
      ),
    });
  }

  return rows;
}

async function fetchKeywordDataRows(
  items: LabsKeywordDataItem[],
): Promise<EnrichedKeyword[]> {
  const rows: EnrichedKeyword[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const kw = item.keyword;
    if (!kw) continue;

    const normalizedKw = normalizeKeyword(kw);
    if (seen.has(normalizedKw)) continue;
    seen.add(normalizedKw);

    const keywordInfo = item.keyword_info_normalized_with_clickstream
      ?.search_volume
      ? item.keyword_info_normalized_with_clickstream
      : item.keyword_info;

    rows.push({
      keyword: normalizedKw,
      searchVolume: keywordInfo?.search_volume ?? null,
      trend: (keywordInfo?.monthly_searches ?? []).map((m) => ({
        year: m.year,
        month: m.month,
        searchVolume: m.search_volume ?? 0,
      })),
      cpc: item.keyword_info?.cpc ?? null,
      competition: item.keyword_info?.competition ?? null,
      keywordDifficulty: item.keyword_properties?.keyword_difficulty ?? null,
      intent: normalizeIntent(item.search_intent_info?.main_intent),
    });
  }

  return rows;
}

async function fetchKeywordRowsWithFallback(
  seedKeyword: string,
  locationCode: number,
  languageCode: string,
  limit: number,
): Promise<{
  rows: EnrichedKeyword[];
  source: KeywordSource;
  usedFallback: boolean;
}> {
  const relatedRows = await fetchRelatedKeywordsWithData(
    seedKeyword,
    locationCode,
    languageCode,
    limit,
  );

  if (relatedRows.length > 0) {
    return {
      rows: relatedRows,
      source: "related",
      usedFallback: false,
    };
  }

  const suggestionRows = await fetchKeywordDataRows(
    await fetchKeywordSuggestionsRaw(
      seedKeyword,
      locationCode,
      languageCode,
      limit,
    ),
  );

  if (suggestionRows.length > 0) {
    return {
      rows: suggestionRows,
      source: "suggestions",
      usedFallback: true,
    };
  }

  const ideaRows = await fetchKeywordDataRows(
    await fetchKeywordIdeasRaw(seedKeyword, locationCode, languageCode, limit),
  );

  return {
    rows: ideaRows,
    source: "ideas",
    usedFallback: true,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

async function research(
  _userId: string,
  input: ResearchKeywordsInput,
): Promise<{
  rows: KeywordResearchRow[];
  source: KeywordSource;
  usedFallback: boolean;
}> {
  const uniqueKeywords = [
    ...new Set(input.keywords.map(normalizeKeyword)),
  ].filter((kw) => kw.length > 0);

  if (uniqueKeywords.length === 0) {
    throw new AppError("VALIDATION_ERROR");
  }

  // Check KV cache
  const cacheKey = buildCacheKey("kw:related", {
    keywords: uniqueKeywords,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    resultLimit: input.resultLimit,
    depth: 3, // bump when depth changes to bust stale cache
  });

  type CachedResult = {
    rows: EnrichedKeyword[];
    source?: KeywordSource;
    usedFallback?: boolean;
  };
  const cached = await getCached<CachedResult>(cacheKey);

  // Only serve cached results that actually have metric data.  Previous
  // failed fetches may have cached rows with all-zero volume/cpc/competition.
  const cacheHasMetrics = cached?.rows?.some(
    (r) => (r.searchVolume ?? 0) > 0 || (r.cpc ?? 0) > 0,
  );

  if (cached && cacheHasMetrics) {
    return {
      rows: cached.rows,
      source: cached.source ?? "related",
      usedFallback: cached.usedFallback ?? false,
    };
  }

  // Fetch keyword data from primary endpoint with fallback chain
  const { rows, source, usedFallback } = await fetchKeywordRowsWithFallback(
    uniqueKeywords[0],
    input.locationCode,
    input.languageCode,
    input.resultLimit,
  );

  // Cache the result
  await setCached(
    cacheKey,
    { rows, source, usedFallback },
    CACHE_TTL.researchResult,
  );

  // Persist metrics to DB (fire-and-forget, don't block the response)
  void Promise.all(
    rows.map((row) =>
      KeywordResearchRepository.upsertKeywordMetric({
        keyword: row.keyword,
        locationCode: input.locationCode,
        languageCode: input.languageCode,
        searchVolume: row.searchVolume,
        cpc: row.cpc,
        competition: row.competition,
        keywordDifficulty: row.keywordDifficulty,
        intent: row.intent,
        monthlySearchesJson: JSON.stringify(row.trend),
      }),
    ),
  ).catch((error) => {
    console.error("keywords.research.persist-metrics failed:", error);
  });

  return { rows, source, usedFallback };
}

async function listProjects(userId: string) {
  const rows = await KeywordResearchRepository.listProjects(userId);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    domain: row.domain,
    createdAt: row.createdAt,
  }));
}

async function createProject(userId: string, input: CreateProjectInput) {
  const id = await KeywordResearchRepository.createProject(
    userId,
    input.name,
    input.domain,
  );
  return { id };
}

async function deleteProject(userId: string, input: DeleteProjectInput) {
  await KeywordResearchRepository.deleteProject(input.projectId, userId);
  return { success: true };
}

async function saveKeywords(userId: string, input: SaveKeywordsInput) {
  const project = await KeywordResearchRepository.getProject(
    input.projectId,
    userId,
  );
  if (!project) {
    throw new AppError("NOT_FOUND");
  }

  const normalizedKeywords = [
    ...new Set(
      input.keywords.map(normalizeKeyword).filter((kw) => kw.length > 0),
    ),
  ];

  const metricByKeyword = new Map(
    (input.metrics ?? [])
      .map((metric) => {
        const keyword = normalizeKeyword(metric.keyword);
        if (!keyword || !normalizedKeywords.includes(keyword)) return null;
        return [keyword, metric] as const;
      })
      .filter(
        (
          entry,
        ): entry is readonly [
          string,
          NonNullable<typeof input.metrics>[number],
        ] => entry != null,
      ),
  );

  if (metricByKeyword.size > 0) {
    await Promise.all(
      normalizedKeywords.map(async (keyword) => {
        const metric = metricByKeyword.get(keyword);
        if (!metric) return;

        await KeywordResearchRepository.upsertKeywordMetric({
          keyword,
          locationCode: input.locationCode,
          languageCode: input.languageCode,
          searchVolume: metric.searchVolume ?? null,
          cpc: metric.cpc ?? null,
          competition: metric.competition ?? null,
          keywordDifficulty: metric.keywordDifficulty ?? null,
          intent: metric.intent ?? null,
          monthlySearchesJson: JSON.stringify(metric.monthlySearches ?? []),
        });
      }),
    );
  }

  await KeywordResearchRepository.saveKeywordsToProject({
    projectId: input.projectId,
    keywords: normalizedKeywords,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
  });

  return { success: true };
}

async function getSavedKeywords(
  userId: string,
  input: GetSavedKeywordsInput,
): Promise<{ rows: SavedKeywordRow[] }> {
  const project = await KeywordResearchRepository.getProject(
    input.projectId,
    userId,
  );
  if (!project) {
    throw new AppError("NOT_FOUND");
  }

  const rows = await KeywordResearchRepository.listSavedKeywordsByProject(
    input.projectId,
  );

  return {
    rows: rows.map(({ row, metric }) => ({
      id: row.id,
      projectId: row.projectId,
      keyword: row.keyword,
      locationCode: row.locationCode,
      languageCode: row.languageCode,
      createdAt: row.createdAt,
      searchVolume: metric?.searchVolume ?? null,
      cpc: metric?.cpc ?? null,
      competition: metric?.competition ?? null,
      keywordDifficulty: metric?.keywordDifficulty ?? null,
      intent: metric?.intent ?? null,
      monthlySearches: parseMonthlySearches(metric?.monthlySearches ?? null),
      fetchedAt: metric?.fetchedAt ?? null,
    })),
  };
}

async function removeSavedKeyword(
  userId: string,
  input: RemoveSavedKeywordInput,
) {
  // Verify the keyword belongs to a project owned by this user
  const savedKw = await KeywordResearchRepository.getSavedKeywordById(
    input.savedKeywordId,
  );
  if (!savedKw) {
    throw new AppError("NOT_FOUND");
  }

  const project = await KeywordResearchRepository.getProject(
    savedKw.projectId,
    userId,
  );
  if (!project) {
    throw new AppError("FORBIDDEN");
  }

  await KeywordResearchRepository.removeSavedKeyword(input.savedKeywordId);
  return { success: true };
}

async function getOrCreateDefaultProject(userId: string) {
  const existing = await KeywordResearchRepository.listProjects(userId);
  if (existing.length > 0) {
    const first = existing[0];
    return {
      id: first.id,
      name: first.name,
      domain: first.domain,
      createdAt: first.createdAt,
    };
  }

  const id = await KeywordResearchRepository.createProject(
    userId,
    "Default",
    undefined,
  );
  return {
    id,
    name: "Default",
    domain: null,
    createdAt: new Date().toISOString(),
  };
}

async function getProject(userId: string, projectId: string) {
  const project = await KeywordResearchRepository.getProject(projectId, userId);
  if (!project) return null;
  return {
    id: project.id,
    name: project.name,
    domain: project.domain,
    createdAt: project.createdAt,
  };
}

// ---------------------------------------------------------------------------
// SERP Analysis
// ---------------------------------------------------------------------------

const SERP_CACHE_TTL_SECONDS = 12 * 60 * 60; // 12 hours

async function getSerpAnalysis(input: {
  keyword: string;
  locationCode: number;
  languageCode: string;
}): Promise<{ items: SerpResultItem[] }> {
  const keyword = normalizeKeyword(input.keyword);

  const cacheKey = buildCacheKey("serp:analysis", {
    keyword,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
  });

  const cached = await getCached<{ items: SerpResultItem[] }>(cacheKey);
  if (cached && cached.items.length > 0) {
    return cached;
  }

  const snapshots = await fetchHistoricalSerpsRaw(
    keyword,
    input.locationCode,
    input.languageCode,
  );

  // Take the most recent snapshot (first item)
  const snapshot = snapshots[0];
  const rawItems = snapshot?.items ?? [];

  // Filter to organic results only and map to our shape
  const items: SerpResultItem[] = rawItems
    .filter((item) => item.type === "organic")
    .map((item) => ({
      rank: item.rank_absolute ?? item.rank_group ?? 0,
      title: item.title ?? "",
      url: item.url ?? "",
      domain: item.domain ?? "",
      description: item.description ?? "",
      etv: item.etv ?? null,
      estimatedPaidTrafficCost: item.estimated_paid_traffic_cost ?? null,
      referringDomains: item.backlinks_info?.referring_domains ?? null,
      backlinks: item.backlinks_info?.backlinks ?? null,
      isNew: item.rank_changes?.is_new ?? false,
      rankChange:
        item.rank_changes?.previous_rank_absolute != null &&
        item.rank_absolute != null
          ? item.rank_changes.previous_rank_absolute - item.rank_absolute
          : null,
    }));

  const result = { items };

  if (items.length > 0) {
    void setCached(cacheKey, result, SERP_CACHE_TTL_SECONDS).catch((err) => {
      console.error("Failed to cache SERP analysis in KV:", err);
    });
  }

  return result;
}

export const KeywordResearchService = {
  research,
  getSerpAnalysis,
  listProjects,
  createProject,
  deleteProject,
  saveKeywords,
  getSavedKeywords,
  removeSavedKeyword,
  getOrCreateDefaultProject,
  getProject,
} as const;
