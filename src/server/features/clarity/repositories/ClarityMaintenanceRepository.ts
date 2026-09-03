import { inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import { clarityReportCache, clarityReportRefreshLeases } from "@/db/schema";

// The IDs stay inside a subquery, so each DELETE uses only cutoff/limit binds
// instead of hundreds of D1 parameters. Twenty batches per table means at most
// forty D1 delete queries for the whole cron invocation. Two final existence
// checks avoid reporting a false incomplete result when a table had exactly
// the maximum number of rows, while staying below the free-plan limit.
const PURGE_BATCH_SIZE = 500;
const MAX_PURGE_BATCHES_PER_TABLE = 20;

async function purgeCache(cutoff: string) {
  let deleted = 0;
  for (let batch = 0; batch < MAX_PURGE_BATCHES_PER_TABLE; batch += 1) {
    const candidates = db
      .select({ id: clarityReportCache.id })
      .from(clarityReportCache)
      .where(lte(clarityReportCache.fetchedAt, cutoff))
      .orderBy(clarityReportCache.fetchedAt)
      .limit(PURGE_BATCH_SIZE);
    const removed = await db
      .delete(clarityReportCache)
      .where(inArray(clarityReportCache.id, candidates))
      .returning({ id: clarityReportCache.id });
    deleted += removed.length;
    if (removed.length < PURGE_BATCH_SIZE) return { deleted, complete: true };
  }
  const remaining = await db
    .select({ id: clarityReportCache.id })
    .from(clarityReportCache)
    .where(lte(clarityReportCache.fetchedAt, cutoff))
    .limit(1);
  return { deleted, complete: remaining.length === 0 };
}

async function purgeLeases(now: string) {
  let deleted = 0;
  for (let batch = 0; batch < MAX_PURGE_BATCHES_PER_TABLE; batch += 1) {
    const candidates = db
      .select({ id: clarityReportRefreshLeases.id })
      .from(clarityReportRefreshLeases)
      .where(lte(clarityReportRefreshLeases.expiresAt, now))
      .orderBy(clarityReportRefreshLeases.expiresAt)
      .limit(PURGE_BATCH_SIZE);
    const removed = await db
      .delete(clarityReportRefreshLeases)
      .where(inArray(clarityReportRefreshLeases.id, candidates))
      .returning({ id: clarityReportRefreshLeases.id });
    deleted += removed.length;
    if (removed.length < PURGE_BATCH_SIZE) return { deleted, complete: true };
  }
  const remaining = await db
    .select({ id: clarityReportRefreshLeases.id })
    .from(clarityReportRefreshLeases)
    .where(lte(clarityReportRefreshLeases.expiresAt, now))
    .limit(1);
  return { deleted, complete: remaining.length === 0 };
}

async function purgeExpiredData(input: { cacheCutoff: string; now: string }) {
  const cache = await purgeCache(input.cacheCutoff);
  const leases = await purgeLeases(input.now);
  return {
    cacheRows: cache.deleted,
    leaseRows: leases.deleted,
    complete: cache.complete && leases.complete,
  };
}

export const ClarityMaintenanceRepository = { purgeExpiredData };
