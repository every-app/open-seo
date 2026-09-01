import { and, count, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";
import { db } from "@/db";
import { executeInBatches, runBatch } from "@/db/runBatch";
import {
  localBusinesses,
  localGridConfigs,
  localGridKeywords,
  localGridRankings,
  localGridResults,
  localGridRunPoints,
  localGridRuns,
} from "@/db/schema";
import type {
  CompletedLocalGridTask,
  PostedLocalGridTask,
} from "@/server/lib/dataforseo";

async function findBusinessByStableIdentifiers(input: {
  projectId: string;
  placeId?: string | null;
  cid?: string | null;
  featureId?: string | null;
}) {
  const matches = [
    input.placeId ? eq(localBusinesses.placeId, input.placeId) : undefined,
    input.cid ? eq(localBusinesses.cid, input.cid) : undefined,
    input.featureId
      ? eq(localBusinesses.featureId, input.featureId)
      : undefined,
  ].filter((value): value is NonNullable<typeof value> => value !== undefined);

  if (matches.length === 0) return null;
  const [business] = await db
    .select()
    .from(localBusinesses)
    .where(and(eq(localBusinesses.projectId, input.projectId), or(...matches)))
    .limit(1);
  return business ?? null;
}

async function updateBusiness(
  businessId: string,
  projectId: string,
  data: Partial<InferInsertModel<typeof localBusinesses>>,
) {
  await db
    .update(localBusinesses)
    .set(data)
    .where(
      and(
        eq(localBusinesses.id, businessId),
        eq(localBusinesses.projectId, projectId),
      ),
    );
}

async function createConfig(input: {
  business?: InferInsertModel<typeof localBusinesses>;
  config: InferInsertModel<typeof localGridConfigs>;
  keywords: Array<InferInsertModel<typeof localGridKeywords>>;
}) {
  await runBatch((tx) => [
    ...(input.business
      ? [tx.insert(localBusinesses).values(input.business)]
      : []),
    tx.insert(localGridConfigs).values(input.config),
    ...input.keywords.map((keyword) =>
      tx.insert(localGridKeywords).values(keyword),
    ),
  ]);
}

async function listConfigs(projectId: string) {
  const rows = await db
    .select({
      config: localGridConfigs,
      business: localBusinesses,
    })
    .from(localGridConfigs)
    .innerJoin(
      localBusinesses,
      eq(localGridConfigs.businessId, localBusinesses.id),
    )
    .where(
      and(
        eq(localGridConfigs.projectId, projectId),
        isNull(localGridConfigs.archivedAt),
      ),
    )
    .orderBy(localGridConfigs.createdAt);

  if (rows.length === 0) return [];
  const configIds = rows.map((row) => row.config.id);
  const keywordCounts = await db
    .select({ configId: localGridKeywords.configId, value: count() })
    .from(localGridKeywords)
    .where(inArray(localGridKeywords.configId, configIds))
    .groupBy(localGridKeywords.configId);
  const counts = new Map(
    keywordCounts.map((row) => [row.configId, Number(row.value)]),
  );

  return rows.map((row) => ({
    ...row,
    keywordCount: counts.get(row.config.id) ?? 0,
  }));
}

async function getConfig(configId: string, projectId: string) {
  const [row] = await db
    .select({
      config: localGridConfigs,
      business: localBusinesses,
    })
    .from(localGridConfigs)
    .innerJoin(
      localBusinesses,
      eq(localGridConfigs.businessId, localBusinesses.id),
    )
    .where(
      and(
        eq(localGridConfigs.id, configId),
        eq(localGridConfigs.projectId, projectId),
        isNull(localGridConfigs.archivedAt),
      ),
    )
    .limit(1);

  if (!row) return null;
  const keywords = await db
    .select()
    .from(localGridKeywords)
    .where(eq(localGridKeywords.configId, configId))
    .orderBy(localGridKeywords.createdAt);
  return { ...row, keywords };
}

async function updateConfig(input: {
  configId: string;
  projectId: string;
  updates: Partial<InferInsertModel<typeof localGridConfigs>>;
  keywords?: Array<InferInsertModel<typeof localGridKeywords>>;
}) {
  await runBatch((tx) => [
    tx
      .update(localGridConfigs)
      .set(input.updates)
      .where(
        and(
          eq(localGridConfigs.id, input.configId),
          eq(localGridConfigs.projectId, input.projectId),
          isNull(localGridConfigs.archivedAt),
        ),
      ),
    ...(input.keywords
      ? [
          tx
            .delete(localGridKeywords)
            .where(eq(localGridKeywords.configId, input.configId)),
          ...input.keywords.map((keyword) =>
            tx.insert(localGridKeywords).values(keyword),
          ),
        ]
      : []),
  ]);
}

async function archiveConfig(
  configId: string,
  projectId: string,
  archivedAt: string,
) {
  const [row] = await db
    .update(localGridConfigs)
    .set({
      archivedAt,
      updatedAt: archivedAt,
      isActive: false,
      nextScanAt: null,
    })
    .where(
      and(
        eq(localGridConfigs.id, configId),
        eq(localGridConfigs.projectId, projectId),
        isNull(localGridConfigs.archivedAt),
      ),
    )
    .returning({ id: localGridConfigs.id });
  return row ?? null;
}

async function tryCreateRun(data: {
  id: string;
  configId: string;
  projectId: string;
  taskCount: number;
}) {
  const inserted = await db
    .insert(localGridRuns)
    .values({ ...data, status: "pending" })
    .onConflictDoNothing()
    .returning({ id: localGridRuns.id });
  return inserted.length > 0;
}

async function insertRunPoints(
  points: Array<InferInsertModel<typeof localGridRunPoints>>,
) {
  await executeInBatches(points, (tx, point) =>
    tx.insert(localGridRunPoints).values(point),
  );
}

async function insertRunResults(
  results: Array<InferInsertModel<typeof localGridResults>>,
) {
  await executeInBatches(results, (tx, result) =>
    tx.insert(localGridResults).values(result),
  );
}

async function getRun(runId: string, projectId: string) {
  const [run] = await db
    .select()
    .from(localGridRuns)
    .where(
      and(eq(localGridRuns.id, runId), eq(localGridRuns.projectId, projectId)),
    )
    .limit(1);
  return run ?? null;
}

async function getLatestRun(configId: string) {
  const [run] = await db
    .select()
    .from(localGridRuns)
    .where(eq(localGridRuns.configId, configId))
    .orderBy(desc(localGridRuns.startedAt))
    .limit(1);
  return run ?? null;
}

async function getActiveRun(configId: string) {
  const [run] = await db
    .select()
    .from(localGridRuns)
    .where(
      and(
        eq(localGridRuns.configId, configId),
        inArray(localGridRuns.status, ["pending", "running"]),
      ),
    )
    .limit(1);
  return run ?? null;
}

async function updateRun(
  runId: string,
  data: Partial<InferInsertModel<typeof localGridRuns>>,
) {
  await db.update(localGridRuns).set(data).where(eq(localGridRuns.id, runId));
}

async function getRunTaskInputs(runId: string) {
  return db
    .select({
      resultId: localGridResults.id,
      pointId: localGridRunPoints.id,
      keywordId: localGridResults.trackingKeywordId,
      keyword: localGridResults.keyword,
      latitude: localGridRunPoints.latitude,
      longitude: localGridRunPoints.longitude,
      providerTaskId: localGridResults.providerTaskId,
      status: localGridResults.status,
    })
    .from(localGridResults)
    .innerJoin(
      localGridRunPoints,
      eq(localGridResults.runPointId, localGridRunPoints.id),
    )
    .where(eq(localGridRunPoints.runId, runId));
}

async function getRunGridResults(runId: string) {
  return db
    .select({
      resultId: localGridResults.id,
      pointId: localGridRunPoints.id,
      trackingKeywordId: localGridResults.trackingKeywordId,
      keyword: localGridResults.keyword,
      rowIndex: localGridRunPoints.rowIndex,
      columnIndex: localGridRunPoints.columnIndex,
      latitude: localGridRunPoints.latitude,
      longitude: localGridRunPoints.longitude,
      status: localGridResults.status,
      targetRank: localGridResults.targetRank,
      matchedBy: localGridResults.matchedBy,
      errorMessage: localGridResults.errorMessage,
    })
    .from(localGridResults)
    .innerJoin(
      localGridRunPoints,
      eq(localGridResults.runPointId, localGridRunPoints.id),
    )
    .where(eq(localGridRunPoints.runId, runId))
    .orderBy(
      localGridResults.keyword,
      localGridRunPoints.rowIndex,
      localGridRunPoints.columnIndex,
    );
}

async function recordPostedTasks(tasks: PostedLocalGridTask[]) {
  await executeInBatches(tasks, (tx, task) =>
    tx
      .update(localGridResults)
      .set({
        providerTaskId: task.taskId,
        providerCostUsd: task.costUsd,
      })
      .where(eq(localGridResults.id, task.resultId)),
  );
}

async function recordCompletedTask(result: CompletedLocalGridTask) {
  const completedAt = new Date().toISOString();
  await runBatch((tx) => [
    tx
      .update(localGridResults)
      .set({
        status: "completed",
        targetRank: result.targetRank,
        matchedBy: result.matchedBy,
        completedAt,
        errorMessage: null,
      })
      .where(eq(localGridResults.id, result.resultId)),
    tx
      .delete(localGridRankings)
      .where(eq(localGridRankings.resultId, result.resultId)),
    ...result.rankings.map((ranking) =>
      tx.insert(localGridRankings).values({
        id: crypto.randomUUID(),
        resultId: result.resultId,
        ...ranking,
      }),
    ),
  ]);
}

async function markResultFailed(resultId: string, message: string) {
  await db
    .update(localGridResults)
    .set({
      status: "failed",
      errorMessage: message.slice(0, 1_000),
      completedAt: new Date().toISOString(),
    })
    .where(eq(localGridResults.id, resultId));
}

async function getRunProgress(runId: string) {
  const [row] = await db
    .select({
      completed: sql<number>`sum(case when ${localGridResults.status} = 'completed' then 1 else 0 end)`,
      failed: sql<number>`sum(case when ${localGridResults.status} = 'failed' then 1 else 0 end)`,
      providerCostUsd: sql<number>`coalesce(sum(${localGridResults.providerCostUsd}), 0)`,
    })
    .from(localGridResults)
    .innerJoin(
      localGridRunPoints,
      eq(localGridResults.runPointId, localGridRunPoints.id),
    )
    .where(eq(localGridRunPoints.runId, runId));
  return {
    completed: Number(row?.completed) || 0,
    failed: Number(row?.failed) || 0,
    providerCostUsd: Number(row?.providerCostUsd) || 0,
  };
}

export const LocalGridRepository = {
  findBusinessByStableIdentifiers,
  updateBusiness,
  createConfig,
  listConfigs,
  getConfig,
  updateConfig,
  archiveConfig,
  tryCreateRun,
  insertRunPoints,
  insertRunResults,
  getRun,
  getLatestRun,
  getActiveRun,
  updateRun,
  getRunTaskInputs,
  getRunGridResults,
  recordPostedTasks,
  recordCompletedTask,
  markResultFailed,
  getRunProgress,
};
