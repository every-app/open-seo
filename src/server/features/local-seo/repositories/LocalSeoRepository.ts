import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { getKeywords, saveKeywords } from "./localKeywordQueries";
import { runBatch } from "@/db/runBatch";
import {
  localRankBusinesses,
  localRankChecks,
  localRankKeywords,
  localRankPoints,
  localRankResults,
  localRankScans,
  localRankTrackers,
} from "@/db/schema";
import { LocalPointStatus, LocalScanStatus } from "@/shared/local-seo";

export type LocalTrackerRow = typeof localRankTrackers.$inferSelect;
type LocalScanRow = typeof localRankScans.$inferSelect;
export type LocalCheckRow = typeof localRankChecks.$inferSelect;
export type LocalPointRow = typeof localRankPoints.$inferSelect;
type BusinessRow = typeof localRankBusinesses.$inferInsert;

async function listTrackers(projectId: string) {
  return db
    .select()
    .from(localRankTrackers)
    .where(eq(localRankTrackers.projectId, projectId))
    .orderBy(desc(localRankTrackers.createdAt));
}

async function getTracker(projectId: string, trackerId: string) {
  return (
    (
      await db
        .select()
        .from(localRankTrackers)
        .where(
          and(
            eq(localRankTrackers.projectId, projectId),
            eq(localRankTrackers.id, trackerId),
          ),
        )
        .limit(1)
    )[0] ?? null
  );
}

async function createTracker(
  tracker: typeof localRankTrackers.$inferInsert,
  keywords: (typeof localRankKeywords.$inferInsert)[],
) {
  await runBatch((tx) => [
    tx.insert(localRankTrackers).values(tracker),
    ...keywords.map((keyword) => tx.insert(localRankKeywords).values(keyword)),
  ]);
}

async function listChecks(projectId: string, trackerId: string) {
  return db
    .select()
    .from(localRankChecks)
    .where(
      and(
        eq(localRankChecks.projectId, projectId),
        eq(localRankChecks.trackerId, trackerId),
      ),
    )
    .orderBy(desc(localRankChecks.createdAt), desc(localRankChecks.id))
    .limit(14);
}

async function getCheck(projectId: string, checkId: string) {
  return (
    (
      await db
        .select()
        .from(localRankChecks)
        .where(
          and(
            eq(localRankChecks.projectId, projectId),
            eq(localRankChecks.id, checkId),
          ),
        )
        .limit(1)
    )[0] ?? null
  );
}

async function getScansForCheck(projectId: string, checkId: string) {
  return db
    .select()
    .from(localRankScans)
    .where(
      and(
        eq(localRankScans.projectId, projectId),
        eq(localRankScans.checkId, checkId),
      ),
    )
    .orderBy(asc(localRankScans.keywordId));
}

async function listScans(
  projectId: string,
  trackerId: string,
  checkIds: string[],
) {
  if (!checkIds.length) return [];
  return db
    .select()
    .from(localRankScans)
    .where(
      and(
        eq(localRankScans.projectId, projectId),
        eq(localRankScans.trackerId, trackerId),
        inArray(localRankScans.checkId, checkIds),
      ),
    )
    .orderBy(desc(localRankScans.createdAt), desc(localRankScans.id));
}

async function getScanSummaries(
  projectId: string,
  trackerId: string,
  checkIds: string[],
) {
  if (!checkIds.length) return [];
  return db
    .select({
      scanId: localRankScans.id,
      total: sql<number>`count(${localRankPoints.id})`.mapWith(Number),
      completed:
        sql<number>`sum(case when ${localRankPoints.status} = 'completed' then 1 else 0 end)`.mapWith(
          Number,
        ),
      found:
        sql<number>`sum(case when ${localRankPoints.status} = 'completed' and ${localRankPoints.rank} is not null then 1 else 0 end)`.mapWith(
          Number,
        ),
      top3: sql<number>`sum(case when ${localRankPoints.status} = 'completed' and ${localRankPoints.rank} <= 3 then 1 else 0 end)`.mapWith(
        Number,
      ),
      rankTotal:
        sql<number>`sum(case when ${localRankPoints.status} = 'completed' then coalesce(${localRankPoints.rank}, 0) else 0 end)`.mapWith(
          Number,
        ),
    })
    .from(localRankScans)
    .leftJoin(localRankPoints, eq(localRankPoints.scanId, localRankScans.id))
    .where(
      and(
        eq(localRankScans.projectId, projectId),
        eq(localRankScans.trackerId, trackerId),
        inArray(localRankScans.checkId, checkIds),
      ),
    )
    .groupBy(localRankScans.id);
}

async function getScan(projectId: string, scanId: string) {
  return (
    (
      await db
        .select()
        .from(localRankScans)
        .where(
          and(
            eq(localRankScans.projectId, projectId),
            eq(localRankScans.id, scanId),
          ),
        )
        .limit(1)
    )[0] ?? null
  );
}

async function getActiveCheck(projectId: string, trackerId: string) {
  return (
    (
      await db
        .select()
        .from(localRankChecks)
        .where(
          and(
            eq(localRankChecks.projectId, projectId),
            eq(localRankChecks.trackerId, trackerId),
            inArray(localRankChecks.status, [
              LocalScanStatus.Queued,
              LocalScanStatus.Running,
            ]),
          ),
        )
        .limit(1)
    )[0] ?? null
  );
}

async function createCheck(
  check: typeof localRankChecks.$inferInsert,
  scans: (typeof localRankScans.$inferInsert)[],
  points: (typeof localRankPoints.$inferInsert)[],
) {
  await runBatch((tx) => [
    tx.insert(localRankChecks).values(check),
    ...scans.map((scan) => tx.insert(localRankScans).values(scan)),
    ...points.map((point) => tx.insert(localRankPoints).values(point)),
  ]);
}

async function updateCheck(
  projectId: string,
  checkId: string,
  updates: Partial<Pick<LocalCheckRow, "status" | "error" | "completedAt">>,
) {
  await db
    .update(localRankChecks)
    .set(updates)
    .where(
      and(
        eq(localRankChecks.projectId, projectId),
        eq(localRankChecks.id, checkId),
        inArray(localRankChecks.status, [
          LocalScanStatus.Queued,
          LocalScanStatus.Running,
        ]),
      ),
    );
}

async function updateScan(
  projectId: string,
  scanId: string,
  updates: Partial<Pick<LocalScanRow, "status" | "error" | "completedAt">>,
) {
  await db
    .update(localRankScans)
    .set(updates)
    .where(
      and(
        eq(localRankScans.projectId, projectId),
        eq(localRankScans.id, scanId),
        inArray(localRankScans.status, [
          LocalScanStatus.Queued,
          LocalScanStatus.Running,
        ]),
      ),
    );
}

async function getPoints(scanId: string) {
  return db
    .select()
    .from(localRankPoints)
    .where(eq(localRankPoints.scanId, scanId))
    .orderBy(asc(localRankPoints.row), asc(localRankPoints.col));
}

async function savePoint(
  point: LocalPointRow,
  businesses: BusinessRow[],
  rankings: { businessId: string; rank: number }[],
  rank: number | null,
  resultsCount: number,
) {
  await runBatch((tx) => [
    ...businesses.map((business) =>
      tx.insert(localRankBusinesses).values(business).onConflictDoNothing(),
    ),
    ...rankings.map((result) =>
      tx
        .insert(localRankResults)
        .values({ id: crypto.randomUUID(), pointId: point.id, ...result }),
    ),
    tx
      .update(localRankPoints)
      .set({
        status: LocalPointStatus.Completed,
        rank,
        resultsCount,
        error: null,
        collectedAt: new Date().toISOString(),
      })
      .where(eq(localRankPoints.id, point.id)),
  ]);
}

async function failPoint(pointId: string, error: string) {
  await db
    .update(localRankPoints)
    .set({ status: LocalPointStatus.Failed, error })
    .where(
      and(
        eq(localRankPoints.id, pointId),
        eq(localRankPoints.status, LocalPointStatus.Pending),
      ),
    );
}

async function failPendingPoints(scanId: string, error: string) {
  await db
    .update(localRankPoints)
    .set({ status: LocalPointStatus.Failed, error })
    .where(
      and(
        eq(localRankPoints.scanId, scanId),
        eq(localRankPoints.status, LocalPointStatus.Pending),
      ),
    );
}

async function getScanResults(projectId: string, scanId: string) {
  return db
    .select({
      pointId: localRankResults.pointId,
      id: localRankBusinesses.id,
      title: localRankBusinesses.title,
      cid: localRankBusinesses.cid,
      placeId: localRankBusinesses.placeId,
      address: localRankBusinesses.address,
      rating: localRankBusinesses.rating,
      reviews: localRankBusinesses.reviews,
      rank: localRankResults.rank,
    })
    .from(localRankResults)
    .innerJoin(
      localRankPoints,
      eq(localRankPoints.id, localRankResults.pointId),
    )
    .innerJoin(localRankScans, eq(localRankScans.id, localRankPoints.scanId))
    .innerJoin(
      localRankBusinesses,
      eq(localRankBusinesses.id, localRankResults.businessId),
    )
    .where(
      and(
        eq(localRankScans.projectId, projectId),
        eq(localRankScans.id, scanId),
      ),
    )
    .orderBy(asc(localRankResults.rank));
}

export const LocalSeoRepository = {
  listTrackers,
  getTracker,
  createTracker,
  getKeywords,
  saveKeywords,
  listChecks,
  getCheck,
  getScansForCheck,
  getScanSummaries,
  listScans,
  getScan,
  getActiveCheck,
  createCheck,
  updateCheck,
  updateScan,
  getPoints,
  savePoint,
  failPoint,
  failPendingPoints,
  getScanResults,
};
