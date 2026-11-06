import { env } from "cloudflare:workers";
import { KeywordResearchRepository } from "@/server/features/keywords/repositories/KeywordResearchRepository";
import { AppError } from "@/server/lib/errors";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { formatCount } from "@/shared/format";
import { jsonCodec } from "@/shared/json";
import type {
  DeleteSavedKeywordTagInput,
  ExportSavedKeywordsInput,
  GetSavedKeywordsInput,
  RemoveSavedKeywordsInput,
  ResolvedSaveKeywordsInput,
  UpdateSavedKeywordTagInput,
  UpdateSavedKeywordTagsInput,
} from "@/types/schemas/keywords";
import type {
  MonthlySearch,
  SavedKeywordRow,
  SavedKeywordTagSummary,
} from "@/types/keywords";
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

// Hosted guardrails for the shared database, far above real use: the largest
// workspace holds about 10k saved keywords and saves at most ~2k in a minute
// (a 2,000-keyword import). One agent saving nonstop wrote 460k in a few hours,
// and the write load stalled the database for every customer. Self-hosters run
// their own database and keep saving without limits.
const SAVED_KEYWORDS_MAX_PER_ORGANIZATION = 25_000;
const SAVE_RATE_LIMIT_PER_MINUTE = 3_000;
// The rate-limit binding counts calls, so each call stands for this many
// keywords (SAVE_KEYWORDS_RATE_LIMIT allows 60 a minute).
const KEYWORDS_PER_RATE_LIMIT_UNIT = 50;

async function assertCanSaveKeywords(
  input: ResolvedSaveKeywordsInput & { organizationId: string },
  keywords: string[],
) {
  // Declared only on the hosted stack (deploy/alchemy/alchemy.run.ts). Counts
  // every keyword sent, re-saves included: they still write metrics and tags.
  const rateLimit = env.SAVE_KEYWORDS_RATE_LIMIT;
  if (rateLimit) {
    const units = Math.ceil(keywords.length / KEYWORDS_PER_RATE_LIMIT_UNIT);
    const outcomes = await Promise.all(
      Array.from({ length: units }, () =>
        rateLimit.limit({ key: input.organizationId }),
      ),
    );
    if (outcomes.some((outcome) => !outcome.success)) {
      throw new AppError(
        "RATE_LIMITED",
        `Saving keywords is limited to ${formatCount(SAVE_RATE_LIMIT_PER_MINUTE)} a minute per workspace. Nothing was saved from this request. Wait a minute, then save the rest in smaller batches.`,
      );
    }
  }

  if (!(await isHostedServerAuthMode())) return;
  // Plain read-then-write: concurrent saves can both pass just under the cap,
  // so a workspace may briefly hold a few hundred more. Re-saving keywords the
  // project already has stays allowed at the cap.
  const total =
    await KeywordResearchRepository.countSavedKeywordsForOrganization(
      input.organizationId,
    );
  if (total + keywords.length <= SAVED_KEYWORDS_MAX_PER_ORGANIZATION) return;
  const existing =
    await KeywordResearchRepository.listSavedKeywordRowsByKeywords({
      ...input,
      keywords,
    });
  const added = keywords.length - existing.length;
  if (total + added <= SAVED_KEYWORDS_MAX_PER_ORGANIZATION) return;
  throw new AppError(
    "VALIDATION_ERROR",
    `This workspace has ${formatCount(total)} saved keywords across its projects, and the limit is ${formatCount(SAVED_KEYWORDS_MAX_PER_ORGANIZATION)}. Nothing was saved. Remove saved keywords you no longer need, then try again.`,
  );
}

export async function saveKeywords(
  input: ResolvedSaveKeywordsInput & { organizationId: string },
) {
  const normalizedKeywords = [
    ...new Set(
      input.keywords.map(normalizeKeyword).filter((kw) => kw.length > 0),
    ),
  ];
  await assertCanSaveKeywords(input, normalizedKeywords);

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

  const savedRows = await KeywordResearchRepository.saveKeywordsToProject({
    projectId: input.projectId,
    keywords: normalizedKeywords,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
  });
  const savedKeywordIds = savedRows.map((row) => row.id);

  if (input.tagMode === "replace") {
    const replacementTags = input.tags ?? [];
    if (replacementTags.length === 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Replacement tags are required when tagMode is replace.",
      );
    }
    await KeywordResearchRepository.replaceTagsForSavedKeywords({
      projectId: input.projectId,
      savedKeywordIds,
      tagNames: replacementTags,
    });
  } else if ((input.tags?.length ?? 0) > 0) {
    await KeywordResearchRepository.addTagsToSavedKeywords({
      projectId: input.projectId,
      savedKeywordIds,
      tagNames: input.tags ?? [],
    });
  }

  return {
    success: true,
    savedKeywordIds,
  };
}

export async function getSavedKeywords(input: GetSavedKeywordsInput): Promise<{
  rows: SavedKeywordRow[];
  totalCount: number;
  tags: SavedKeywordTagSummary[];
}> {
  const result = await KeywordResearchRepository.listSavedKeywordsByProject({
    projectId: input.projectId,
    search: input.search,
    includeTerms: input.includeTerms,
    excludeTerms: input.excludeTerms,
    minVolume: input.minVolume,
    maxVolume: input.maxVolume,
    minCpc: input.minCpc,
    maxCpc: input.maxCpc,
    minDifficulty: input.minDifficulty,
    maxDifficulty: input.maxDifficulty,
    tagIds: input.tagIds,
    tagNames: input.tagNames,
    page: input.page,
    pageSize: input.pageSize,
    sort: input.sort,
    order: input.order,
  });

  return {
    rows: mapSavedKeywordRows(result.rows),
    totalCount: result.totalCount,
    tags: mapSavedKeywordTags(result.tags),
  };
}

export async function exportSavedKeywords(
  input: ExportSavedKeywordsInput,
): Promise<{ rows: SavedKeywordRow[] }> {
  const result = await KeywordResearchRepository.listSavedKeywordsByProject({
    projectId: input.projectId,
    search: input.search,
    includeTerms: input.includeTerms,
    excludeTerms: input.excludeTerms,
    minVolume: input.minVolume,
    maxVolume: input.maxVolume,
    minCpc: input.minCpc,
    maxCpc: input.maxCpc,
    minDifficulty: input.minDifficulty,
    maxDifficulty: input.maxDifficulty,
    tagIds: input.tagIds,
    tagNames: input.tagNames,
    sort: input.sort,
    order: input.order,
  });

  return { rows: mapSavedKeywordRows(result.rows) };
}

export async function updateSavedKeywordTags(
  input: UpdateSavedKeywordTagsInput,
) {
  const addResult =
    (input.addTags?.length ?? 0) > 0
      ? await KeywordResearchRepository.addTagsToSavedKeywords({
          projectId: input.projectId,
          savedKeywordIds: input.savedKeywordIds,
          tagNames: input.addTags ?? [],
        })
      : { savedKeywordCount: 0, tags: [] };

  const removeResult =
    (input.removeTagIds?.length ?? 0) > 0
      ? await KeywordResearchRepository.removeTagsFromSavedKeywords({
          projectId: input.projectId,
          savedKeywordIds: input.savedKeywordIds,
          tagIds: input.removeTagIds ?? [],
        })
      : { removedCount: 0, savedKeywordCount: 0, tags: [] };

  return {
    success: true,
    taggedCount: Math.max(
      addResult.savedKeywordCount,
      removeResult.savedKeywordCount,
    ),
    addedTags: addResult.tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      normalizedName: tag.normalizedName,
      color: tag.color ?? null,
    })),
    removedTagIds: removeResult.tags.map((tag) => tag.id),
    removedAssignments: removeResult.removedCount,
  };
}

function mapSavedKeywordRows(
  rows: Awaited<
    ReturnType<typeof KeywordResearchRepository.listSavedKeywordsByProject>
  >["rows"],
): SavedKeywordRow[] {
  return rows.map(({ row, metric, tags }) => ({
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
    tags: tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      normalizedName: tag.normalizedName,
      color: tag.color ?? null,
    })),
  }));
}

function mapSavedKeywordTags(
  tags: Awaited<
    ReturnType<typeof KeywordResearchRepository.listSavedKeywordsByProject>
  >["tags"],
): SavedKeywordTagSummary[] {
  return tags.map((tag) => ({
    id: tag.id,
    name: tag.name,
    normalizedName: tag.normalizedName,
    color: tag.color ?? null,
    keywordCount: tag.keywordCount,
  }));
}

export async function updateSavedKeywordTag(input: UpdateSavedKeywordTagInput) {
  const updated = await KeywordResearchRepository.updateSavedKeywordTag({
    projectId: input.projectId,
    tagId: input.tagId,
    name: input.name,
    color: input.color,
  });
  if (!updated) return { success: false as const };
  return {
    success: true as const,
    tag: {
      id: updated.id,
      name: updated.name,
      normalizedName: updated.normalizedName,
      color: updated.color ?? null,
    },
  };
}

export async function deleteSavedKeywordTag(input: DeleteSavedKeywordTagInput) {
  const result = await KeywordResearchRepository.deleteSavedKeywordTag({
    projectId: input.projectId,
    tagId: input.tagId,
  });
  if (result.status === "in_use") {
    throw new TagInUseError(result.assignmentCount);
  }
  return { success: result.status === "deleted" };
}

class TagInUseError extends Error {
  readonly code = "TAG_IN_USE" as const;
  constructor(readonly assignmentCount: number) {
    super(
      `Tag is attached to ${assignmentCount} keyword${assignmentCount === 1 ? "" : "s"}. Remove the tag from those keywords first.`,
    );
    this.name = "TagInUseError";
  }
}

export async function removeSavedKeywords(
  projectId: string,
  input: RemoveSavedKeywordsInput,
) {
  const deletedCount = await KeywordResearchRepository.removeSavedKeywords(
    input.savedKeywordIds,
    projectId,
  );
  return { success: true, deletedCount };
}
