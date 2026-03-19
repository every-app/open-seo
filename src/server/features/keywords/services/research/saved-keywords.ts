import { AppError } from "@/server/lib/errors";
import { KeywordResearchRepository } from "@/server/features/keywords/repositories/KeywordResearchRepository";
import { jsonCodec } from "@/shared/json";
import type {
  GetSavedKeywordsInput,
  RemoveSavedKeywordInput,
  SaveKeywordsInput,
} from "@/types/schemas/keywords";
import type { MonthlySearch, SavedKeywordRow } from "@/types/keywords";
import { normalizeKeyword } from "./helpers";
import { z } from "zod";

const monthlySearchSchema = z.object({
  year: z.number().int().positive(),
  month: z.number().int().min(1).max(12),
  searchVolume: z.number().int().nonnegative(),
});

const monthlySearchesCodec = jsonCodec(z.array(monthlySearchSchema));

function parseMonthlySearches(payload: string | null): MonthlySearch[] {
  if (!payload) return [];
  const result = monthlySearchesCodec.safeParse(payload);
  return result.success ? result.data : [];
}

export async function saveKeywords(input: SaveKeywordsInput) {
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
          projectId: input.projectId,
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

export async function getSavedKeywords(
  input: GetSavedKeywordsInput,
): Promise<{ rows: SavedKeywordRow[] }> {
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
  projectId: string,
  input: RemoveSavedKeywordInput,
) {
  const savedKw = await KeywordResearchRepository.getSavedKeywordById(
    input.savedKeywordId,
  );
  if (!savedKw) {
    throw new AppError("NOT_FOUND");
  }

  if (savedKw.projectId !== projectId) {
    throw new AppError("FORBIDDEN");
  }

  await KeywordResearchRepository.removeSavedKeyword(
    input.savedKeywordId,
    projectId,
  );
  return { success: true };
}
