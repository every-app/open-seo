import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { keywordMetrics, savedKeywords } from "@/db/schema";

async function upsertKeywordMetric(params: {
  projectId: string;
  keyword: string;
  locationCode: number;
  languageCode: string;
  searchVolume: number | null;
  cpc: number | null;
  competition: number | null;
  keywordDifficulty: number | null;
  intent: string | null;
  monthlySearchesJson: string;
}) {
  const fetchedAt = new Date().toISOString();

  await db
    .insert(keywordMetrics)
    .values({
      projectId: params.projectId,
      keyword: params.keyword,
      locationCode: params.locationCode,
      languageCode: params.languageCode,
      searchVolume: params.searchVolume,
      cpc: params.cpc,
      competition: params.competition,
      keywordDifficulty: params.keywordDifficulty,
      intent: params.intent,
      monthlySearches: params.monthlySearchesJson,
      fetchedAt,
    })
    .onConflictDoUpdate({
      target: [
        keywordMetrics.projectId,
        keywordMetrics.keyword,
        keywordMetrics.locationCode,
        keywordMetrics.languageCode,
      ],
      set: {
        searchVolume: params.searchVolume,
        cpc: params.cpc,
        competition: params.competition,
        keywordDifficulty: params.keywordDifficulty,
        intent: params.intent,
        monthlySearches: params.monthlySearchesJson,
        fetchedAt,
      },
    });
}

async function countSavedKeywords(projectId: string) {
  const [result] = await db
    .select({ value: count() })
    .from(savedKeywords)
    .where(eq(savedKeywords.projectId, projectId));
  return result?.value ?? 0;
}

async function saveKeywordsToProject(params: {
  projectId: string;
  keywords: string[];
  locationCode: number;
  languageCode: string;
}) {
  if (params.keywords.length === 0) return;

  await db
    .insert(savedKeywords)
    .values(
      params.keywords.map((keyword) => ({
        id: crypto.randomUUID(),
        projectId: params.projectId,
        keyword,
        locationCode: params.locationCode,
        languageCode: params.languageCode,
      })),
    )
    .onConflictDoNothing();
}

async function listSavedKeywordsByProject(projectId: string) {
  return db
    .select({ row: savedKeywords, metric: keywordMetrics })
    .from(savedKeywords)
    .leftJoin(
      keywordMetrics,
      and(
        eq(keywordMetrics.keyword, savedKeywords.keyword),
        eq(keywordMetrics.projectId, savedKeywords.projectId),
        eq(keywordMetrics.locationCode, savedKeywords.locationCode),
        eq(keywordMetrics.languageCode, savedKeywords.languageCode),
      ),
    )
    .where(eq(savedKeywords.projectId, projectId))
    .orderBy(desc(savedKeywords.createdAt));
}

async function removeSavedKeyword(savedKeywordId: string, projectId: string) {
  await db
    .delete(savedKeywords)
    .where(
      and(
        eq(savedKeywords.id, savedKeywordId),
        eq(savedKeywords.projectId, projectId),
      ),
    );
}

async function getSavedKeywordById(savedKeywordId: string) {
  return db.query.savedKeywords.findFirst({
    where: eq(savedKeywords.id, savedKeywordId),
  });
}

export const KeywordResearchRepository = {
  upsertKeywordMetric,
  countSavedKeywords,
  saveKeywordsToProject,
  listSavedKeywordsByProject,
  removeSavedKeyword,
  getSavedKeywordById,
} as const;
