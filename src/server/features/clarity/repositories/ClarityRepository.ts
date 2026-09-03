import { and, eq, gt, inArray, lte, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  clarityConnections,
  clarityReportCache,
  clarityReportRefreshLeases,
} from "@/db/schema";
import { runBatch } from "@/db/runBatch";

export type ClarityConnection = typeof clarityConnections.$inferSelect;
export type ClarityCacheRow = typeof clarityReportCache.$inferSelect;

async function getConnectionByProjectId(
  projectId: string,
): Promise<ClarityConnection | null> {
  const rows = await db
    .select()
    .from(clarityConnections)
    .where(eq(clarityConnections.projectId, projectId))
    .limit(1);
  return rows[0] ?? null;
}

async function upsertConnectionWithOverview(input: {
  projectId: string;
  organizationId: string;
  encryptedApiToken: string;
  tokenHint: string;
  connectedByUserId: string;
  responseJson: string;
  fetchedAt: string;
}): Promise<void> {
  const connectionId = crypto.randomUUID();
  const cacheId = crypto.randomUUID();
  await runBatch((tx) => [
    // A replacement token may belong to a different Clarity project. Clear
    // every old report before saving the newly validated overview so data from
    // two Clarity projects can never be mixed.
    tx
      .delete(clarityReportCache)
      .where(eq(clarityReportCache.projectId, input.projectId)),
    tx
      .delete(clarityReportRefreshLeases)
      .where(eq(clarityReportRefreshLeases.projectId, input.projectId)),
    // Replacing the parent row gives every connection a new generation id.
    // Cache and lease rows reference it with ON DELETE CASCADE, so Postgres and
    // SQLite both reject a late write made with the previous credential.
    tx
      .delete(clarityConnections)
      .where(eq(clarityConnections.projectId, input.projectId)),
    tx.insert(clarityConnections).values({
      id: connectionId,
      projectId: input.projectId,
      organizationId: input.organizationId,
      encryptedApiToken: input.encryptedApiToken,
      tokenHint: input.tokenHint,
      connectedByUserId: input.connectedByUserId,
      createdAt: input.fetchedAt,
      updatedAt: input.fetchedAt,
    }),
    tx
      .insert(clarityReportCache)
      .values({
        id: cacheId,
        projectId: input.projectId,
        reportKind: "overview",
        numOfDays: 3,
        connectionId,
        responseJson: input.responseJson,
        fetchedAt: input.fetchedAt,
      })
      .onConflictDoUpdate({
        target: [
          clarityReportCache.projectId,
          clarityReportCache.reportKind,
          clarityReportCache.numOfDays,
        ],
        set: {
          connectionId,
          responseJson: input.responseJson,
          fetchedAt: input.fetchedAt,
        },
      }),
  ]);
}

async function getCachedReport(input: {
  projectId: string;
  reportKind: string;
  numOfDays: number;
  connectionId: string;
}): Promise<ClarityCacheRow | null> {
  const rows = await db
    .select()
    .from(clarityReportCache)
    .where(
      and(
        eq(clarityReportCache.projectId, input.projectId),
        eq(clarityReportCache.reportKind, input.reportKind),
        eq(clarityReportCache.numOfDays, input.numOfDays),
        eq(clarityReportCache.connectionId, input.connectionId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function upsertCachedReportIfCurrent(input: {
  projectId: string;
  reportKind: string;
  numOfDays: number;
  connectionId: string;
  responseJson: string;
  fetchedAt: string;
}): Promise<boolean> {
  const cacheId = crypto.randomUUID();
  // The SELECT avoids a write when the connection generation is already old;
  // the FK is the cross-dialect backstop if replacement races this statement.
  const currentConnectionReport = db
    .select({
      id: sql<string>`${cacheId}`.as("id"),
      projectId: clarityConnections.projectId,
      reportKind: sql<string>`${input.reportKind}`.as("report_kind"),
      numOfDays: sql<number>`${input.numOfDays}`.as("num_of_days"),
      connectionId: clarityConnections.id,
      responseJson: sql<string>`${input.responseJson}`.as("response_json"),
      fetchedAt: sql<string>`${input.fetchedAt}`.as("fetched_at"),
    })
    .from(clarityConnections)
    .where(
      and(
        eq(clarityConnections.projectId, input.projectId),
        eq(clarityConnections.id, input.connectionId),
      ),
    );

  try {
    const saved = await db
      .insert(clarityReportCache)
      .select(currentConnectionReport)
      .onConflictDoUpdate({
        target: [
          clarityReportCache.projectId,
          clarityReportCache.reportKind,
          clarityReportCache.numOfDays,
        ],
        set: {
          connectionId: input.connectionId,
          responseJson: input.responseJson,
          fetchedAt: input.fetchedAt,
        },
      })
      .returning({ id: clarityReportCache.id });
    return saved.length > 0;
  } catch (error) {
    const current = await getConnectionByProjectId(input.projectId);
    if (current?.id !== input.connectionId) return false;
    throw error;
  }
}

async function claimReportRefresh(input: {
  projectId: string;
  reportKind: string;
  numOfDays: number;
  connectionId: string;
  now: string;
  expiresAt: string;
}): Promise<string | null> {
  const leaseId = crypto.randomUUID();
  const rowId = crypto.randomUUID();
  const currentConnectionLease = db
    .select({
      id: sql<string>`${rowId}`.as("id"),
      projectId: clarityConnections.projectId,
      reportKind: sql<string>`${input.reportKind}`.as("report_kind"),
      numOfDays: sql<number>`${input.numOfDays}`.as("num_of_days"),
      connectionId: clarityConnections.id,
      leaseId: sql<string>`${leaseId}`.as("lease_id"),
      expiresAt: sql<string>`${input.expiresAt}`.as("expires_at"),
      errorCode: sql<string | null>`null`.as("error_code"),
    })
    .from(clarityConnections)
    .where(
      and(
        eq(clarityConnections.projectId, input.projectId),
        eq(clarityConnections.id, input.connectionId),
      ),
    );
  try {
    const [claimed] = await db
      .insert(clarityReportRefreshLeases)
      .select(currentConnectionLease)
      .onConflictDoUpdate({
        target: [
          clarityReportRefreshLeases.projectId,
          clarityReportRefreshLeases.reportKind,
          clarityReportRefreshLeases.numOfDays,
        ],
        set: {
          connectionId: input.connectionId,
          leaseId,
          expiresAt: input.expiresAt,
          errorCode: null,
        },
        setWhere: or(
          ne(clarityReportRefreshLeases.connectionId, input.connectionId),
          lte(clarityReportRefreshLeases.expiresAt, input.now),
        ),
      })
      .returning({ leaseId: clarityReportRefreshLeases.leaseId });
    return claimed?.leaseId === leaseId ? leaseId : null;
  } catch (error) {
    const current = await getConnectionByProjectId(input.projectId);
    if (current?.id !== input.connectionId) return null;
    throw error;
  }
}

async function recordReportRefreshFailure(input: {
  projectId: string;
  reportKind: string;
  numOfDays: number;
  connectionId: string;
  leaseId: string;
  errorCode: string;
  retryAt: string;
}): Promise<boolean> {
  const saved = await db
    .update(clarityReportRefreshLeases)
    .set({ errorCode: input.errorCode, expiresAt: input.retryAt })
    .where(
      and(
        eq(clarityReportRefreshLeases.projectId, input.projectId),
        eq(clarityReportRefreshLeases.reportKind, input.reportKind),
        eq(clarityReportRefreshLeases.numOfDays, input.numOfDays),
        eq(clarityReportRefreshLeases.connectionId, input.connectionId),
        eq(clarityReportRefreshLeases.leaseId, input.leaseId),
      ),
    )
    .returning({ id: clarityReportRefreshLeases.id });
  return saved.length > 0;
}

async function getReportRefreshState(input: {
  projectId: string;
  reportKind: string;
  numOfDays: number;
  connectionId: string;
  now: string;
}): Promise<{ errorCode: string | null; expiresAt: string } | null> {
  const rows = await db
    .select({
      errorCode: clarityReportRefreshLeases.errorCode,
      expiresAt: clarityReportRefreshLeases.expiresAt,
    })
    .from(clarityReportRefreshLeases)
    .where(
      and(
        eq(clarityReportRefreshLeases.projectId, input.projectId),
        eq(clarityReportRefreshLeases.reportKind, input.reportKind),
        eq(clarityReportRefreshLeases.numOfDays, input.numOfDays),
        eq(clarityReportRefreshLeases.connectionId, input.connectionId),
        gt(clarityReportRefreshLeases.expiresAt, input.now),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function getConnectionRefreshFailure(input: {
  projectId: string;
  connectionId: string;
  now: string;
}): Promise<{ errorCode: string | null; expiresAt: string } | null> {
  const rows = await db
    .select({
      errorCode: clarityReportRefreshLeases.errorCode,
      expiresAt: clarityReportRefreshLeases.expiresAt,
    })
    .from(clarityReportRefreshLeases)
    .where(
      and(
        eq(clarityReportRefreshLeases.projectId, input.projectId),
        eq(clarityReportRefreshLeases.connectionId, input.connectionId),
        inArray(clarityReportRefreshLeases.errorCode, [
          "clarity_reconnect_required",
          "clarity_rate_limited",
          "clarity_storage_unavailable",
        ]),
        gt(clarityReportRefreshLeases.expiresAt, input.now),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function releaseReportRefresh(input: {
  projectId: string;
  reportKind: string;
  numOfDays: number;
  connectionId: string;
  leaseId: string;
}): Promise<void> {
  await db
    .delete(clarityReportRefreshLeases)
    .where(
      and(
        eq(clarityReportRefreshLeases.projectId, input.projectId),
        eq(clarityReportRefreshLeases.reportKind, input.reportKind),
        eq(clarityReportRefreshLeases.numOfDays, input.numOfDays),
        eq(clarityReportRefreshLeases.connectionId, input.connectionId),
        eq(clarityReportRefreshLeases.leaseId, input.leaseId),
      ),
    );
}

async function hasActiveReportRefresh(input: {
  projectId: string;
  reportKind: string;
  numOfDays: number;
  connectionId: string;
  now: string;
}): Promise<boolean> {
  const rows = await db
    .select({ id: clarityReportRefreshLeases.id })
    .from(clarityReportRefreshLeases)
    .where(
      and(
        eq(clarityReportRefreshLeases.projectId, input.projectId),
        eq(clarityReportRefreshLeases.reportKind, input.reportKind),
        eq(clarityReportRefreshLeases.numOfDays, input.numOfDays),
        eq(clarityReportRefreshLeases.connectionId, input.connectionId),
        gt(clarityReportRefreshLeases.expiresAt, input.now),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

async function disconnect(projectId: string): Promise<void> {
  await runBatch((tx) => [
    tx
      .delete(clarityReportCache)
      .where(eq(clarityReportCache.projectId, projectId)),
    tx
      .delete(clarityReportRefreshLeases)
      .where(eq(clarityReportRefreshLeases.projectId, projectId)),
    tx
      .delete(clarityConnections)
      .where(eq(clarityConnections.projectId, projectId)),
  ]);
}

export const ClarityRepository = {
  getConnectionByProjectId,
  upsertConnectionWithOverview,
  getCachedReport,
  upsertCachedReportIfCurrent,
  claimReportRefresh,
  releaseReportRefresh,
  recordReportRefreshFailure,
  getReportRefreshState,
  getConnectionRefreshFailure,
  hasActiveReportRefresh,
  disconnect,
};
