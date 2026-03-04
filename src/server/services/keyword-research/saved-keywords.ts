import { AppError } from "@/server/lib/errors";
import { KeywordResearchRepository } from "@/server/repositories/KeywordResearchRepository";
import type {
  GetSavedKeywordsInput,
  RemoveSavedKeywordInput,
  SaveKeywordsInput,
} from "@/types/schemas/keywords";
import type { MonthlySearch, SavedKeywordRow } from "@/types/keywords";
import { normalizeKeyword } from "./helpers";

function parseMonthlySearches(payload: string | null): MonthlySearch[] {
  if (!payload) return [];
  try {
    return JSON.parse(payload) as MonthlySearch[];
  } catch (error) {
    console.error("keywords.saved.parse-monthly-searches failed:", error);
    return [];
  }
}

export async function saveKeywords(userId: string, input: SaveKeywordsInput) {
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

  await KeywordResearchRepository.saveKeywordsToProject({
    projectId: input.projectId,
    keywords: normalizedKeywords,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
  });

  return { success: true };
}

export async function getSavedKeywords(
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

export async function removeSavedKeyword(
  userId: string,
  input: RemoveSavedKeywordInput,
) {
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
