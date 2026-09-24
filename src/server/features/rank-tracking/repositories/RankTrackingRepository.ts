import {
  and,
  asc,
  count,
  eq,
  inArray,
  isNull,
  lte,
  max,
  ne,
} from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";
import { db } from "@/db";
import {
  rankTrackingConfigs,
  rankCheckRuns,
  rankTrackingKeywords,
  projects,
} from "@/db/schema";
import { DB_BATCH_SIZE, executeInBatches } from "@/db/runBatch";
import type { RankTrackingSkipReason } from "@/shared/rank-tracking";
import {
  getLatestSnapshotsForKeywords,
  getSnapshotsBeforeDate,
  getEarliestSnapshotsForKeywords,
  getKeywordHistory,
  getConfigTrend,
  getPositionMatrix,
} from "./snapshotQueries";
import {
  tryCreateRun,
  updateRun,
  setRunErrorIfEmpty,
  getRunById,
  getLatestRunForConfig,
  getActiveRunForConfig,
  insertSnapshots,
  getSnapshotsForRun,
  countKeywordsCheckedForRun,
} from "./runQueries";

// ---------------------------------------------------------------------------
// Config CRUD
// ---------------------------------------------------------------------------

async function getConfigsForProject(projectId: string) {
  return db
    .select()
    .from(rankTrackingConfigs)
    .where(
      and(
        eq(rankTrackingConfigs.projectId, projectId),
        eq(rankTrackingConfigs.isActive, true),
      ),
    )
    .orderBy(rankTrackingConfigs.createdAt);
}

async function getConfigById({
  configId,
  projectId,
}: {
  configId: string;
  projectId: string;
}) {
  const rows = await db
    .select()
    .from(rankTrackingConfigs)
    .where(
      and(
        eq(rankTrackingConfigs.id, configId),
        eq(rankTrackingConfigs.projectId, projectId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function getConfigByProjectDomainLocation(
  projectId: string,
  domain: string,
  locationCode: number,
  locationName: string | null,
) {
  const rows = await db
    .select()
    .from(rankTrackingConfigs)
    .where(
      and(
        eq(rankTrackingConfigs.projectId, projectId),
        eq(rankTrackingConfigs.domain, domain),
        eq(rankTrackingConfigs.locationCode, locationCode),
        // National (NULL) and per-city configs are distinct rows — mirrors
        // the partial unique indexes, so a national config and any number of
        // city configs can coexist for the same domain.
        locationName === null
          ? isNull(rankTrackingConfigs.locationName)
          : eq(rankTrackingConfigs.locationName, locationName),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function createConfig(
  data: InferInsertModel<typeof rankTrackingConfigs>,
) {
  await db.insert(rankTrackingConfigs).values(data);
}

async function updateConfig(
  configId: string,
  projectId: string,
  data: Partial<InferInsertModel<typeof rankTrackingConfigs>>,
) {
  await db
    .update(rankTrackingConfigs)
    .set(data)
    .where(
      and(
        eq(rankTrackingConfigs.id, configId),
        eq(rankTrackingConfigs.projectId, projectId),
      ),
    );
}

// Caps per-tick loop work (claims, per-org plan checks) against the cron
// wall clock; paid-heavy ticks are stopped earlier by the unit budget and
// slow ticks by TICK_DEADLINE_MS in scheduledRankChecks.ts.
const DUE_CONFIGS_PER_TICK = 500;

async function getDueConfigsWithOrganization(nowIso: string) {
  return (
    db
      .select({
        id: rankTrackingConfigs.id,
        projectId: rankTrackingConfigs.projectId,
        domain: rankTrackingConfigs.domain,
        locationCode: rankTrackingConfigs.locationCode,
        languageCode: rankTrackingConfigs.languageCode,
        locationName: rankTrackingConfigs.locationName,
        devices: rankTrackingConfigs.devices,
        serpDepth: rankTrackingConfigs.serpDepth,
        scheduleInterval: rankTrackingConfigs.scheduleInterval,
        nextCheckAt: rankTrackingConfigs.nextCheckAt,
        organizationId: projects.organizationId,
      })
      .from(rankTrackingConfigs)
      .innerJoin(projects, eq(rankTrackingConfigs.projectId, projects.id))
      .where(
        and(
          eq(rankTrackingConfigs.isActive, true),
          // A manual config can keep a stale non-null next_check_at; without this
          // it would be selected every tick and never advanced.
          ne(rankTrackingConfigs.scheduleInterval, "manual"),
          lte(rankTrackingConfigs.nextCheckAt, nowIso),
          isNull(projects.archivedAt),
        ),
      )
      // Oldest first so a large backlog drains in order instead of the same
      // arbitrary rows filling every batch. `lte` already excludes NULL, so both
      // ordering columns are non-null and SQLite/Postgres agree.
      .orderBy(
        asc(rankTrackingConfigs.nextCheckAt),
        asc(rankTrackingConfigs.id),
      )
      .limit(DUE_CONFIGS_PER_TICK)
  );
}

/**
 * Conditionally advance a due config's schedule, returning false when the
 * config changed underneath us (manual edit, deactivation).
 *
 * `next_check_at` equality is the compare-and-set token. `schedule_interval` is
 * deliberately absent from the predicate: every schedule edit rewrites
 * `next_check_at` (updateConfig recomputes it, or nulls it for "manual"), so
 * the timestamp check already detects interval changes.
 *
 * `lastSkipReason` is written only when the caller passes it — the restore
 * path omits it so it can't clobber a reason the blocking run just wrote.
 */
async function claimDueConfig(input: {
  configId: string;
  projectId: string;
  observedNextCheckAt: string;
  nextCheckAt: string;
  lastSkipReason?: RankTrackingSkipReason | null;
}): Promise<boolean> {
  const claimed = await db
    .update(rankTrackingConfigs)
    .set({
      nextCheckAt: input.nextCheckAt,
      ...(input.lastSkipReason !== undefined && {
        lastSkipReason: input.lastSkipReason,
      }),
    })
    .where(
      and(
        eq(rankTrackingConfigs.id, input.configId),
        eq(rankTrackingConfigs.projectId, input.projectId),
        eq(rankTrackingConfigs.isActive, true),
        eq(rankTrackingConfigs.nextCheckAt, input.observedNextCheckAt),
      ),
    )
    .returning({ id: rankTrackingConfigs.id });
  return claimed.length > 0;
}

// ---------------------------------------------------------------------------
// Tracking keywords per config
// ---------------------------------------------------------------------------

async function getKeywordsForConfig(configId: string) {
  return db
    .select()
    .from(rankTrackingKeywords)
    .where(eq(rankTrackingKeywords.configId, configId))
    .orderBy(rankTrackingKeywords.createdAt);
}

async function addKeywordsToConfig(
  keywords: (typeof rankTrackingKeywords.$inferInsert)[],
) {
  const insertedIds: string[] = [];

  // Keep each statement below D1's bound-parameter limit and return only rows
  // that actually won the unique(config_id, keyword) race.
  const insertBatchSize = 25;
  for (let i = 0; i < keywords.length; i += insertBatchSize) {
    const chunk = keywords.slice(i, i + insertBatchSize);
    const inserted = await db
      .insert(rankTrackingKeywords)
      .values(chunk)
      .onConflictDoNothing()
      .returning({ id: rankTrackingKeywords.id });
    insertedIds.push(...inserted.map((row) => row.id));
  }

  return insertedIds;
}

async function removeKeywordsFromConfig(
  keywordIds: string[],
  configId: string,
) {
  if (keywordIds.length === 0) return [];

  const removedIds: string[] = [];
  // One extra bind is used by configId; keep each IN list below D1's ~100
  // parameter ceiling while preserving the config ownership predicate.
  const deleteBatchSize = 90;
  for (let i = 0; i < keywordIds.length; i += deleteBatchSize) {
    const chunk = keywordIds.slice(i, i + deleteBatchSize);
    const removed = await db
      .delete(rankTrackingKeywords)
      .where(
        and(
          inArray(rankTrackingKeywords.id, chunk),
          eq(rankTrackingKeywords.configId, configId),
        ),
      )
      .returning({ id: rankTrackingKeywords.id });
    removedIds.push(...removed.map((row) => row.id));
  }
  return removedIds;
}

async function getConfigSummaries(projectId: string) {
  const configs = await getConfigsForProject(projectId);
  if (configs.length === 0) return [];

  const kwCountMap = await getKeywordCountsForConfigs(configs.map((c) => c.id));

  // Subquery: latest startedAt per config
  const latestStarted = db
    .select({
      configId: rankCheckRuns.configId,
      maxStartedAt: max(rankCheckRuns.startedAt).as("maxStartedAt"),
    })
    .from(rankCheckRuns)
    .where(
      inArray(
        rankCheckRuns.configId,
        configs.map((c) => c.id),
      ),
    )
    .groupBy(rankCheckRuns.configId)
    .as("latestStarted");

  // Join back to get status + completedAt for each config's latest run
  const latestRuns = await db
    .select({
      configId: rankCheckRuns.configId,
      status: rankCheckRuns.status,
      completedAt: rankCheckRuns.completedAt,
    })
    .from(rankCheckRuns)
    .innerJoin(
      latestStarted,
      and(
        eq(rankCheckRuns.configId, latestStarted.configId),
        eq(rankCheckRuns.startedAt, latestStarted.maxStartedAt),
      ),
    );

  const latestRunMap = new Map<
    string,
    { status: string; completedAt: string | null }
  >();
  for (const run of latestRuns) {
    latestRunMap.set(run.configId, {
      status: run.status,
      completedAt: run.completedAt,
    });
  }

  return configs.map((config) => ({
    ...config,
    keywordCount: kwCountMap.get(config.id) ?? 0,
    lastRunStatus: latestRunMap.get(config.id)?.status ?? null,
    lastRunCompletedAt: latestRunMap.get(config.id)?.completedAt ?? null,
  }));
}

async function updateKeywordMetrics(
  updates: Array<{
    id: string;
    searchVolume: number | null;
    keywordDifficulty: number | null;
    cpc: number | null;
    metricsFetchedAt: string;
  }>,
) {
  await executeInBatches(updates, (tx, u) =>
    tx
      .update(rankTrackingKeywords)
      .set({
        searchVolume: u.searchVolume,
        keywordDifficulty: u.keywordDifficulty,
        cpc: u.cpc,
        metricsFetchedAt: u.metricsFetchedAt,
      })
      .where(eq(rankTrackingKeywords.id, u.id)),
  );
}

async function getKeywordCountForConfig(configId: string) {
  const rows = await db
    .select({ value: count() })
    .from(rankTrackingKeywords)
    .where(eq(rankTrackingKeywords.configId, configId));
  return rows[0]?.value ?? 0;
}

/** Keyword counts keyed by config id. Configs with no keywords are absent. */
async function getKeywordCountsForConfigs(configIds: string[]) {
  // Chunked so the IN list stays under D1's ~100 bound-parameter cap.
  const counts = new Map<string, number>();
  for (let i = 0; i < configIds.length; i += DB_BATCH_SIZE) {
    const chunk = configIds.slice(i, i + DB_BATCH_SIZE);
    const rows = await db
      .select({ configId: rankTrackingKeywords.configId, value: count() })
      .from(rankTrackingKeywords)
      .where(inArray(rankTrackingKeywords.configId, chunk))
      .groupBy(rankTrackingKeywords.configId);
    for (const row of rows) counts.set(row.configId, row.value);
  }
  return counts;
}

export const RankTrackingRepository = {
  getConfigsForProject,
  getConfigById,
  getConfigByProjectDomainLocation,
  createConfig,
  updateConfig,
  getDueConfigsWithOrganization,
  claimDueConfig,
  tryCreateRun,
  updateRun,
  setRunErrorIfEmpty,
  getRunById,
  getLatestRunForConfig,
  getActiveRunForConfig,
  insertSnapshots,
  getSnapshotsForRun,
  countKeywordsCheckedForRun,
  getKeywordsForConfig,
  addKeywordsToConfig,
  removeKeywordsFromConfig,
  updateKeywordMetrics,
  getKeywordCountForConfig,
  getKeywordCountsForConfigs,
  getConfigSummaries,
  getLatestSnapshotsForKeywords,
  getSnapshotsBeforeDate,
  getEarliestSnapshotsForKeywords,
  getKeywordHistory,
  getConfigTrend,
  getPositionMatrix,
};
