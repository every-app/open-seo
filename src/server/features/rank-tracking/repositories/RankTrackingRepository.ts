import { and, asc, count, desc, eq, gte, inArray, lte, max } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";
import { db } from "@/db";
import {
  rankTrackingConfigs,
  rankCheckRuns,
  rankCheckLocks,
  rankSnapshots,
  rankTrackingKeywords,
  projects,
} from "@/db/schema";

const DB_BATCH_SIZE = 100;
type BatchStatement = Parameters<typeof db.batch>[0][number];

async function executeInBatches<T>(
  items: T[],
  buildStatement: (item: T) => BatchStatement,
) {
  for (let i = 0; i < items.length; i += DB_BATCH_SIZE) {
    const chunk = items.slice(i, i + DB_BATCH_SIZE).map(buildStatement);
    const [first, ...rest] = chunk;
    if (!first) continue;
    await db.batch([first, ...rest]);
  }
}

// ---------------------------------------------------------------------------
// Config CRUD
// ---------------------------------------------------------------------------

async function getConfigsForProject(projectId: string) {
  return db
    .select()
    .from(rankTrackingConfigs)
    .where(eq(rankTrackingConfigs.projectId, projectId))
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
) {
  const rows = await db
    .select()
    .from(rankTrackingConfigs)
    .where(
      and(
        eq(rankTrackingConfigs.projectId, projectId),
        eq(rankTrackingConfigs.domain, domain),
        eq(rankTrackingConfigs.locationCode, locationCode),
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

async function getDueConfigsWithOrganization(nowIso: string) {
  return db
    .select({
      id: rankTrackingConfigs.id,
      projectId: rankTrackingConfigs.projectId,
      domain: rankTrackingConfigs.domain,
      locationCode: rankTrackingConfigs.locationCode,
      languageCode: rankTrackingConfigs.languageCode,
      devices: rankTrackingConfigs.devices,
      scheduleInterval: rankTrackingConfigs.scheduleInterval,
      nextCheckAt: rankTrackingConfigs.nextCheckAt,
      organizationId: projects.organizationId,
    })
    .from(rankTrackingConfigs)
    .innerJoin(projects, eq(rankTrackingConfigs.projectId, projects.id))
    .where(
      and(
        eq(rankTrackingConfigs.isActive, true),
        lte(rankTrackingConfigs.nextCheckAt, nowIso),
      ),
    )
    .limit(50);
}

// ---------------------------------------------------------------------------
// Run CRUD
// ---------------------------------------------------------------------------

async function createRun(data: {
  id: string;
  configId: string;
  projectId: string;
  keywordsTotal: number;
  isSubsetRun?: boolean;
}) {
  await db.insert(rankCheckRuns).values({
    ...data,
    status: "pending",
  });
}

async function updateRun(
  runId: string,
  data: Partial<InferInsertModel<typeof rankCheckRuns>>,
) {
  await db.update(rankCheckRuns).set(data).where(eq(rankCheckRuns.id, runId));
}

async function getRunById(runId: string) {
  const rows = await db
    .select()
    .from(rankCheckRuns)
    .where(eq(rankCheckRuns.id, runId))
    .limit(1);
  return rows[0] ?? null;
}

async function getLatestRunForConfig(configId: string) {
  const rows = await db
    .select()
    .from(rankCheckRuns)
    .where(eq(rankCheckRuns.configId, configId))
    .orderBy(desc(rankCheckRuns.startedAt))
    .limit(1);
  return rows[0] ?? null;
}

async function tryCreateRunLock(configId: string, runId: string) {
  const inserted = await db
    .insert(rankCheckLocks)
    .values({ configId, runId })
    .onConflictDoNothing({ target: rankCheckLocks.configId })
    .returning({ runId: rankCheckLocks.runId });

  return inserted.length > 0;
}

async function getRunLock(configId: string) {
  const rows = await db
    .select()
    .from(rankCheckLocks)
    .where(eq(rankCheckLocks.configId, configId))
    .limit(1);
  return rows[0] ?? null;
}

async function deleteRunLock(configId: string, runId?: string) {
  await db
    .delete(rankCheckLocks)
    .where(
      runId
        ? and(
            eq(rankCheckLocks.configId, configId),
            eq(rankCheckLocks.runId, runId),
          )
        : eq(rankCheckLocks.configId, configId),
    );
}

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

async function insertSnapshots(
  snapshots: Array<
    Omit<InferInsertModel<typeof rankSnapshots>, "id" | "checkedAt">
  >,
) {
  await executeInBatches(snapshots, (snapshot) =>
    db.insert(rankSnapshots).values(snapshot).onConflictDoNothing(),
  );
}

async function getSnapshotsForRun(runId: string) {
  return db.select().from(rankSnapshots).where(eq(rankSnapshots.runId, runId));
}

async function getRecentCompletedRuns(configId: string, limit: number) {
  return db
    .select()
    .from(rankCheckRuns)
    .where(
      and(
        eq(rankCheckRuns.configId, configId),
        eq(rankCheckRuns.status, "completed"),
        eq(rankCheckRuns.isSubsetRun, false),
      ),
    )
    .orderBy(desc(rankCheckRuns.startedAt))
    .limit(limit);
}

async function getClosestCompletedRun(configId: string, targetDate: string) {
  const [beforeRows, afterRows] = await Promise.all([
    db
      .select()
      .from(rankCheckRuns)
      .where(
        and(
          eq(rankCheckRuns.configId, configId),
          eq(rankCheckRuns.status, "completed"),
          eq(rankCheckRuns.isSubsetRun, false),
          lte(rankCheckRuns.startedAt, targetDate),
        ),
      )
      .orderBy(desc(rankCheckRuns.startedAt))
      .limit(1),
    db
      .select()
      .from(rankCheckRuns)
      .where(
        and(
          eq(rankCheckRuns.configId, configId),
          eq(rankCheckRuns.status, "completed"),
          eq(rankCheckRuns.isSubsetRun, false),
          gte(rankCheckRuns.startedAt, targetDate),
        ),
      )
      .orderBy(asc(rankCheckRuns.startedAt))
      .limit(1),
  ]);

  const before = beforeRows[0] ?? null;
  const after = afterRows[0] ?? null;
  if (!before) return after;
  if (!after) return before;

  const targetMs = new Date(targetDate).getTime();
  const beforeDiff = Math.abs(targetMs - new Date(before.startedAt).getTime());
  const afterDiff = Math.abs(new Date(after.startedAt).getTime() - targetMs);
  return beforeDiff <= afterDiff ? before : after;
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
  keywords: Array<{ id: string; configId: string; keyword: string }>,
) {
  await executeInBatches(keywords, (kw) =>
    db.insert(rankTrackingKeywords).values(kw).onConflictDoNothing(),
  );
}

async function removeKeywordsFromConfig(
  keywordIds: string[],
  configId: string,
) {
  await db
    .delete(rankTrackingKeywords)
    .where(
      and(
        inArray(rankTrackingKeywords.id, keywordIds),
        eq(rankTrackingKeywords.configId, configId),
      ),
    );
}

async function getConfigSummaries(projectId: string) {
  const configs = await getConfigsForProject(projectId);
  if (configs.length === 0) return [];

  // Batch: keyword counts grouped by config
  const kwCounts = await db
    .select({
      configId: rankTrackingKeywords.configId,
      value: count(),
    })
    .from(rankTrackingKeywords)
    .where(
      inArray(
        rankTrackingKeywords.configId,
        configs.map((c) => c.id),
      ),
    )
    .groupBy(rankTrackingKeywords.configId);

  const kwCountMap = new Map(kwCounts.map((r) => [r.configId, r.value]));

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

async function getKeywordCountForConfig(configId: string) {
  const rows = await db
    .select({ value: count() })
    .from(rankTrackingKeywords)
    .where(eq(rankTrackingKeywords.configId, configId));
  return rows[0]?.value ?? 0;
}

export const RankTrackingRepository = {
  getConfigsForProject,
  getConfigById,
  getConfigByProjectDomainLocation,
  createConfig,
  updateConfig,
  getDueConfigsWithOrganization,
  createRun,
  updateRun,
  getRunById,
  getLatestRunForConfig,
  tryCreateRunLock,
  getRunLock,
  deleteRunLock,
  insertSnapshots,
  getSnapshotsForRun,
  getRecentCompletedRuns,
  getClosestCompletedRun,
  getKeywordsForConfig,
  addKeywordsToConfig,
  removeKeywordsFromConfig,
  getKeywordCountForConfig,
  getConfigSummaries,
};
