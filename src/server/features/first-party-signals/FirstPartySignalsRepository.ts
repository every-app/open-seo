import { and, asc, eq, gt, inArray, isNull, lt, or } from "drizzle-orm";
import { sort } from "remeda";
import { db } from "@/db";
import { executeInBatches, runBatch } from "@/db/runBatch";
import {
  firstPartySignalBatches,
  firstPartySignalDailyAggregates,
  firstPartySignalSourcePaths,
  firstPartySignalSources,
  projects,
} from "@/db/schema";

async function getSourceByProject(projectId: string) {
  const [row] = await db
    .select()
    .from(firstPartySignalSources)
    .where(eq(firstPartySignalSources.projectId, projectId))
    .limit(1);
  return row ?? null;
}

async function upsertSource(input: {
  projectId: string;
  organizationId: string;
  name: string;
  encryptedSecret: string;
  secretHint: string;
  createdByUserId: string;
  allowedPaths: string[];
  now: string;
}): Promise<string> {
  const existing = await getSourceByProject(input.projectId);
  const sourceId = existing?.id ?? crypto.randomUUID();
  await runBatch((tx) => [
    tx
      .insert(firstPartySignalSources)
      .values({
        id: sourceId,
        projectId: input.projectId,
        organizationId: input.organizationId,
        name: input.name,
        encryptedSecret: input.encryptedSecret,
        secretHint: input.secretHint,
        createdByUserId: input.createdByUserId,
        revokedAt: null,
        createdAt: existing?.createdAt ?? input.now,
        updatedAt: input.now,
      })
      .onConflictDoUpdate({
        target: firstPartySignalSources.projectId,
        set: {
          name: input.name,
          encryptedSecret: input.encryptedSecret,
          secretHint: input.secretHint,
          createdByUserId: input.createdByUserId,
          revokedAt: null,
          updatedAt: input.now,
        },
      }),
    tx
      .delete(firstPartySignalSourcePaths)
      .where(eq(firstPartySignalSourcePaths.sourceId, sourceId)),
    ...input.allowedPaths.map((path) =>
      tx.insert(firstPartySignalSourcePaths).values({
        id: crypto.randomUUID(),
        sourceId,
        path,
        createdAt: input.now,
      }),
    ),
  ]);
  return sourceId;
}

async function listSources(projectId: string) {
  const rows = await db
    .select({
      id: firstPartySignalSources.id,
      name: firstPartySignalSources.name,
      secretHint: firstPartySignalSources.secretHint,
      revokedAt: firstPartySignalSources.revokedAt,
      createdAt: firstPartySignalSources.createdAt,
      updatedAt: firstPartySignalSources.updatedAt,
    })
    .from(firstPartySignalSources)
    .where(eq(firstPartySignalSources.projectId, projectId))
    .orderBy(asc(firstPartySignalSources.name));
  if (rows.length === 0) return [];
  const paths = await db
    .select({
      sourceId: firstPartySignalSourcePaths.sourceId,
      path: firstPartySignalSourcePaths.path,
    })
    .from(firstPartySignalSourcePaths)
    .where(
      inArray(
        firstPartySignalSourcePaths.sourceId,
        rows.map((row) => row.id),
      ),
    );
  return rows.map((row) => ({
    ...row,
    allowedPaths: sort(
      paths.filter((path) => path.sourceId === row.id).map((path) => path.path),
      (a, b) => a.localeCompare(b),
    ),
  }));
}

async function revokeSource(projectId: string, sourceId: string, now: string) {
  const rows = await db
    .update(firstPartySignalSources)
    .set({ encryptedSecret: "", revokedAt: now, updatedAt: now })
    .where(
      and(
        eq(firstPartySignalSources.id, sourceId),
        eq(firstPartySignalSources.projectId, projectId),
      ),
    )
    .returning({ id: firstPartySignalSources.id });
  return rows.length > 0;
}

async function getActiveSourceForIngest(sourceId: string) {
  const [source] = await db
    .select({
      id: firstPartySignalSources.id,
      projectId: firstPartySignalSources.projectId,
      encryptedSecret: firstPartySignalSources.encryptedSecret,
      projectDomain: projects.domain,
    })
    .from(firstPartySignalSources)
    .innerJoin(projects, eq(projects.id, firstPartySignalSources.projectId))
    .where(
      and(
        eq(firstPartySignalSources.id, sourceId),
        isNull(firstPartySignalSources.revokedAt),
      ),
    )
    .limit(1);
  if (!source || !source.projectDomain) return null;
  const paths = await db
    .select({ path: firstPartySignalSourcePaths.path })
    .from(firstPartySignalSourcePaths)
    .where(eq(firstPartySignalSourcePaths.sourceId, sourceId));
  return {
    ...source,
    projectDomain: source.projectDomain,
    allowedPaths: paths.map((row) => row.path),
  };
}

async function getBatch(sourceId: string, batchId: string) {
  const [row] = await db
    .select()
    .from(firstPartySignalBatches)
    .where(
      and(
        eq(firstPartySignalBatches.sourceId, sourceId),
        eq(firstPartySignalBatches.batchId, batchId),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function getBatchForDate(sourceId: string, snapshotDate: string) {
  const [row] = await db
    .select()
    .from(firstPartySignalBatches)
    .where(
      and(
        eq(firstPartySignalBatches.sourceId, sourceId),
        eq(firstPartySignalBatches.snapshotDate, snapshotDate),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function createBatch(input: {
  sourceId: string;
  batchId: string;
  snapshotDate: string;
  payloadDigest: string;
  leaseId: string;
  leaseExpiresAt: string;
  now: string;
}) {
  const id = crypto.randomUUID();
  await db.insert(firstPartySignalBatches).values({
    id,
    sourceId: input.sourceId,
    batchId: input.batchId,
    snapshotDate: input.snapshotDate,
    payloadDigest: input.payloadDigest,
    status: "pending",
    processingLeaseId: input.leaseId,
    processingLeaseExpiresAt: input.leaseExpiresAt,
    receivedAt: input.now,
  });
  return id;
}

async function claimBatchForProcessing(input: {
  id: string;
  payloadDigest: string;
  leaseId: string;
  leaseExpiresAt: string;
  now: string;
}) {
  const rows = await db
    .update(firstPartySignalBatches)
    .set({
      status: "pending",
      receivedAt: input.now,
      completedAt: null,
      processingLeaseId: input.leaseId,
      processingLeaseExpiresAt: input.leaseExpiresAt,
    })
    .where(
      and(
        eq(firstPartySignalBatches.id, input.id),
        eq(firstPartySignalBatches.payloadDigest, input.payloadDigest),
        or(
          eq(firstPartySignalBatches.status, "failed"),
          and(
            eq(firstPartySignalBatches.status, "pending"),
            or(
              isNull(firstPartySignalBatches.processingLeaseId),
              isNull(firstPartySignalBatches.processingLeaseExpiresAt),
              lt(firstPartySignalBatches.processingLeaseExpiresAt, input.now),
            ),
          ),
        ),
      ),
    )
    .returning({ id: firstPartySignalBatches.id });
  return rows.length > 0;
}

async function renewBatchLease(input: {
  id: string;
  leaseId: string;
  now: string;
  leaseExpiresAt: string;
}) {
  const rows = await db
    .update(firstPartySignalBatches)
    .set({ processingLeaseExpiresAt: input.leaseExpiresAt })
    .where(
      and(
        eq(firstPartySignalBatches.id, input.id),
        eq(firstPartySignalBatches.status, "pending"),
        eq(firstPartySignalBatches.processingLeaseId, input.leaseId),
        gt(firstPartySignalBatches.processingLeaseExpiresAt, input.now),
      ),
    )
    .returning({ id: firstPartySignalBatches.id });
  return rows.length > 0;
}

type AggregateInput = {
  landingPath: string;
  searchStarted: number;
  searchCompleted: number;
  searchNoResults: number;
  registrationsCompleted: number;
  checkoutStarted: number;
  paymentsCompleted: number;
};

async function replaceBatchRows(input: {
  batchReceiptId: string;
  processingAttemptId: string;
  rows: AggregateInput[];
  now: string;
}) {
  await db
    .delete(firstPartySignalDailyAggregates)
    .where(
      and(
        eq(
          firstPartySignalDailyAggregates.batchReceiptId,
          input.batchReceiptId,
        ),
        eq(
          firstPartySignalDailyAggregates.processingAttemptId,
          input.processingAttemptId,
        ),
      ),
    );
  await executeInBatches(input.rows, (tx, row) =>
    tx.insert(firstPartySignalDailyAggregates).values({
      id: crypto.randomUUID(),
      batchReceiptId: input.batchReceiptId,
      processingAttemptId: input.processingAttemptId,
      landingPath: row.landingPath,
      searchStarted: row.searchStarted,
      searchCompleted: row.searchCompleted,
      searchNoResults: row.searchNoResults,
      registrationsCompleted: row.registrationsCompleted,
      checkoutStarted: row.checkoutStarted,
      paymentsCompleted: row.paymentsCompleted,
      receivedAt: input.now,
    }),
  );
}

async function completeBatch(input: {
  batchReceiptId: string;
  leaseId: string;
  now: string;
}) {
  const completed = await db
    .update(firstPartySignalBatches)
    .set({ status: "complete", completedAt: input.now })
    .where(
      and(
        eq(firstPartySignalBatches.id, input.batchReceiptId),
        eq(firstPartySignalBatches.status, "pending"),
        eq(firstPartySignalBatches.processingLeaseId, input.leaseId),
      ),
    )
    .returning({ id: firstPartySignalBatches.id });
  return completed.length > 0;
}

async function failBatch(batchReceiptId: string, leaseId: string, now: string) {
  await db
    .update(firstPartySignalBatches)
    .set({
      status: "failed",
      completedAt: now,
      processingLeaseId: null,
      processingLeaseExpiresAt: null,
    })
    .where(
      and(
        eq(firstPartySignalBatches.id, batchReceiptId),
        eq(firstPartySignalBatches.status, "pending"),
        eq(firstPartySignalBatches.processingLeaseId, leaseId),
      ),
    );
}

async function purgeOlderThan(cutoffDate: string) {
  const deleted = await db
    .delete(firstPartySignalBatches)
    .where(lt(firstPartySignalBatches.snapshotDate, cutoffDate))
    .returning({ id: firstPartySignalBatches.id });
  return deleted.length;
}

export const FirstPartySignalsRepository = {
  upsertSource,
  listSources,
  revokeSource,
  getActiveSourceForIngest,
  getBatch,
  getBatchForDate,
  createBatch,
  claimBatchForProcessing,
  renewBatchLease,
  replaceBatchRows,
  completeBatch,
  failBatch,
  purgeOlderThan,
};
