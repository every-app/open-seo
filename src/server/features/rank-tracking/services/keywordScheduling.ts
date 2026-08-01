import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { rankTrackingKeywords } from "@/db/schema";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import { AppError } from "@/server/lib/errors";
import type {
  EffectiveKeywordScheduleInterval,
  RankTrackingConfig,
  RankTrackingKeywordScheduleInterval,
} from "@/types/schemas/rank-tracking";
import { computeNextCheckAt } from "@/shared/rank-tracking";
import { getValidatedConfig } from "./rankTrackingConfigAccess";

type ScheduledInterval = Exclude<
  RankTrackingConfig["scheduleInterval"],
  "manual"
>;

type ScheduleConfig = {
  scheduleInterval: ScheduledInterval | "manual";
  nextCheckAt: string | null;
};

export type ScheduleKeyword = Pick<
  Awaited<ReturnType<typeof RankTrackingRepository.getKeywordsForConfig>>[0],
  "id" | "scheduleIntervalOverride" | "nextCheckAt"
>;


export function isScheduledInterval(
  interval: string | null | undefined,
): interval is ScheduledInterval {
  return (
    interval === "daily" || interval === "weekly" || interval === "monthly"
  );
}

export function getEffectiveKeywordScheduleInterval(
  keyword: Pick<ScheduleKeyword, "scheduleIntervalOverride">,
  configScheduleInterval: RankTrackingConfig["scheduleInterval"],
): EffectiveKeywordScheduleInterval {
  if (keyword.scheduleIntervalOverride === "manual-paused") {
    return "manual-paused";
  }
  if (isScheduledInterval(keyword.scheduleIntervalOverride)) {
    return keyword.scheduleIntervalOverride;
  }
  return configScheduleInterval;
}

export function isConfigScheduleDue(
  config: ScheduleConfig,
  nowIso: string,
): boolean {
  return (
    isScheduledInterval(config.scheduleInterval) &&
    config.nextCheckAt !== null &&
    config.nextCheckAt <= nowIso
  );
}

export function getDueKeywordsForScheduledRun<TKeyword extends ScheduleKeyword>(
  config: ScheduleConfig,
  keywords: TKeyword[],
  nowIso: string,
): TKeyword[] {
  const configDue = isConfigScheduleDue(config, nowIso);

  return keywords.filter((keyword) => {
    if (keyword.scheduleIntervalOverride === "manual-paused") return false;

    if (isScheduledInterval(keyword.scheduleIntervalOverride)) {
      return (
        keyword.nextCheckAt === null || keyword.nextCheckAt <= nowIso
      );
    }

    return configDue && isScheduledInterval(config.scheduleInterval);
  });
}

export function getNextKeywordCheckAt(
  keyword: Pick<
    ScheduleKeyword,
    "scheduleIntervalOverride" | "nextCheckAt"
  >,
): string | null {
  if (
    keyword.scheduleIntervalOverride !== "daily" &&
    keyword.scheduleIntervalOverride !== "weekly"
  )
    return null;
  return computeNextCheckAt(
    keyword.scheduleIntervalOverride,
    keyword.nextCheckAt,
  );
}

export async function getKeywordSchedules(configId: string, projectId: string) {
  const config = await getValidatedConfig(configId, projectId);
  const keywords = await RankTrackingRepository.getKeywordsForConfig(configId);

  return {
    configScheduleInterval: config.scheduleInterval,
    keywords: keywords.map((keyword) => ({
      trackingKeywordId: keyword.id,
      keyword: keyword.keyword,
      scheduleIntervalOverride: keyword.scheduleIntervalOverride,
      effectiveInterval: getEffectiveKeywordScheduleInterval(
        keyword,
        config.scheduleInterval,
      ),
      nextCheckAt: keyword.nextCheckAt,
    })),
  };
}

export async function updateKeywordScheduleOverride(
  configId: string,
  projectId: string,
  keywordIds: string[],
  scheduleIntervalOverride: RankTrackingKeywordScheduleInterval,
) {
  await getValidatedConfig(configId, projectId);
  const uniqueIds = [...new Set(keywordIds)];
  if (uniqueIds.length === 0) {
    throw new AppError("VALIDATION_ERROR", "Select at least one keyword");
  }

  const existing = await RankTrackingRepository.getKeywordsForConfig(configId);
  const existingIds = new Set(existing.map((keyword) => keyword.id));
  const selectedIds = uniqueIds.filter((id) => existingIds.has(id));
  if (selectedIds.length !== uniqueIds.length) {
    throw new AppError("VALIDATION_ERROR", "Keyword not found");
  }

  const nextCheckAt = isScheduledInterval(scheduleIntervalOverride)
    ? computeNextCheckAt(scheduleIntervalOverride)
    : null;

  await db
    .update(rankTrackingKeywords)
    .set({ scheduleIntervalOverride, nextCheckAt })
    .where(
      and(
        eq(rankTrackingKeywords.configId, configId),
        inArray(rankTrackingKeywords.id, selectedIds),
      ),
    );

  return { updated: selectedIds.length };
}

export async function advanceKeywordSchedulesForScheduledRun(
  keywords: ScheduleKeyword[],
) {
  for (const keyword of keywords) {
    const nextCheckAt = getNextKeywordCheckAt(keyword);
    if (nextCheckAt === null) continue;

    await db
      .update(rankTrackingKeywords)
      .set({ nextCheckAt })
      .where(eq(rankTrackingKeywords.id, keyword.id));
  }
}

// ---------------------------------------------------------------------------
// Trigger a manual check
// ---------------------------------------------------------------------------