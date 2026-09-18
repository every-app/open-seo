import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";
import { db } from "@/db";
import { rankCheckRuns, rankSnapshots } from "@/db/schema";
import { executeInBatches } from "@/db/runBatch";

// ---------------------------------------------------------------------------
// Run CRUD
// ---------------------------------------------------------------------------

/**
 * Try to insert a new pending run. Returns true when inserted, or false if blocked
 * by the partial unique index on (config_id) WHERE status IN ('pending',
 * 'running') — i.e. another active run exists for this config.
 *
 * This is how duplicate-trigger protection is enforced: the DB rejects the
 * second insert rather than a separate lock table.
 */
export async function tryCreateRun(data: {
  id: string;
  configId: string;
  projectId: string;
  keywordsTotal: number;
  isSubsetRun?: boolean;
}) {
  const inserted = await db
    .insert(rankCheckRuns)
    .values({ ...data, status: "pending" })
    .onConflictDoNothing()
    .returning({ id: rankCheckRuns.id });
  return Boolean(inserted[0]);
}

export async function updateRun(
  runId: string,
  data: Partial<InferInsertModel<typeof rankCheckRuns>>,
) {
  await db.update(rankCheckRuns).set(data).where(eq(rankCheckRuns.id, runId));
}

/**
 * Record why a keyword failed, first reason wins. Batch steps call this on
 * each rejection so finalize can show the vendor's actual message instead of
 * a generic "could not be checked".
 */
export async function setRunErrorIfEmpty(runId: string, errorMessage: string) {
  await db
    .update(rankCheckRuns)
    .set({ errorMessage })
    .where(
      and(eq(rankCheckRuns.id, runId), isNull(rankCheckRuns.errorMessage)),
    );
}

export async function getRunById(runId: string) {
  const rows = await db
    .select()
    .from(rankCheckRuns)
    .where(eq(rankCheckRuns.id, runId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getLatestRunForConfig(configId: string) {
  const rows = await db
    .select()
    .from(rankCheckRuns)
    .where(eq(rankCheckRuns.configId, configId))
    .orderBy(desc(rankCheckRuns.startedAt))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Returns the currently active (pending or running) run for a config, if any.
 * At most one such row exists, enforced by the partial unique index.
 */
export async function getActiveRunForConfig(configId: string) {
  const rows = await db
    .select()
    .from(rankCheckRuns)
    .where(
      and(
        eq(rankCheckRuns.configId, configId),
        inArray(rankCheckRuns.status, ["pending", "running"]),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

export async function insertSnapshots(
  snapshots: Array<
    Omit<InferInsertModel<typeof rankSnapshots>, "id" | "checkedAt">
  >,
) {
  // Target the (run, keyword, device) unique index explicitly. An UNtargeted
  // ON CONFLICT DO NOTHING also swallows a primary-key collision, which would
  // silently drop every row if the `id` serial sequence ever drifts behind
  // max(id) (e.g. after a data import that copied explicit ids). Scoping the
  // clause to the intended dedupe index keeps re-runs idempotent while letting
  // a pk collision surface as a loud duplicate-key error instead of data loss.
  await executeInBatches(snapshots, (tx, snapshot) =>
    tx
      .insert(rankSnapshots)
      .values(snapshot)
      .onConflictDoNothing({
        target: [
          rankSnapshots.runId,
          rankSnapshots.trackingKeywordId,
          rankSnapshots.device,
        ],
      }),
  );
}

export async function getSnapshotsForRun(runId: string) {
  return db.select().from(rankSnapshots).where(eq(rankSnapshots.runId, runId));
}
