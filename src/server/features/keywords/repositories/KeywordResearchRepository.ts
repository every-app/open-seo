import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { keywordMetrics, projects, savedKeywords } from "@/db/schema";
import { AppError } from "@/server/lib/errors";

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

async function listProjects(userId: string) {
  return db.query.projects.findMany({
    where: eq(projects.userId, userId),
    orderBy: desc(projects.createdAt),
  });
}

async function getProject(projectId: string, userId: string) {
  return db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
  });
}

async function getProjectPsiApiKey(projectId: string, userId: string) {
  const project = await getProject(projectId, userId);
  if (!project) {
    throw new AppError("NOT_FOUND");
  }
  return project.pagespeedApiKey ?? null;
}

async function setProjectPsiApiKey(
  projectId: string,
  userId: string,
  apiKey: string,
) {
  const project = await getProject(projectId, userId);
  if (!project) {
    throw new AppError("NOT_FOUND");
  }

  await db
    .update(projects)
    .set({ pagespeedApiKey: apiKey })
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
}

async function clearProjectPsiApiKey(projectId: string, userId: string) {
  const project = await getProject(projectId, userId);
  if (!project) {
    throw new AppError("NOT_FOUND");
  }

  await db
    .update(projects)
    .set({ pagespeedApiKey: null })
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
}

async function createProject(userId: string, name: string, domain?: string) {
  const id = crypto.randomUUID();
  await db.insert(projects).values({
    id,
    userId,
    name,
    domain,
  });
  return id;
}

async function deleteProject(projectId: string, userId: string) {
  const project = await getProject(projectId, userId);
  if (!project) {
    throw new AppError("NOT_FOUND");
  }
  // savedKeywords cascade-delete via FK
  await db
    .delete(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
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

async function removeSavedKeyword(savedKeywordId: string) {
  await db.delete(savedKeywords).where(eq(savedKeywords.id, savedKeywordId));
}

async function getSavedKeywordById(savedKeywordId: string) {
  return db.query.savedKeywords.findFirst({
    where: eq(savedKeywords.id, savedKeywordId),
  });
}

export const KeywordResearchRepository = {
  upsertKeywordMetric,
  listProjects,
  getProject,
  getProjectPsiApiKey,
  setProjectPsiApiKey,
  clearProjectPsiApiKey,
  createProject,
  deleteProject,
  countSavedKeywords,
  saveKeywordsToProject,
  listSavedKeywordsByProject,
  removeSavedKeyword,
  getSavedKeywordById,
} as const;
