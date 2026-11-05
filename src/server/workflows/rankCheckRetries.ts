import type { WorkflowStep } from "cloudflare:workers";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import type { RankCheckTaskInput } from "@/server/lib/dataforseo";
import {
  MAX_READS_PER_CHECK,
  MIN_READS_PER_CHECK,
} from "@/shared/rank-tracking";
import { pgStep } from "@/server/workflows/pgStep";
import {
  COLLECT_STEP_CONFIG,
  expandToTaskInputs,
  mapResultsToSnapshotRows,
  runQueuedTasks,
  type CheckContext,
  type RankCheckResultWithDevice,
} from "@/server/workflows/rankCheckPaths";

// ---------------------------------------------------------------------------
// Further reads. Google serves some scraped searches a fake results page that
// looks normal but leaves out or reshuffles sites that really rank, so one read
// can't be trusted. Every keyword/device pair gets MIN_READS_PER_CHECK reads,
// and up to MAX_READS_PER_CHECK while a read missed the site or the positions
// disagree. Reads are billed like any other check, and the best position wins.
// ---------------------------------------------------------------------------

/** Positions this close together count as the reads agreeing. */
const READS_AGREE_WITHIN_POSITIONS = 2;

/**
 * No new round of reads starts after this long. One round polls for up to an
 * hour, so a check ends in about two hours. Slow rounds get fewer reads.
 */
export const READ_WINDOW_MS = 60 * 60_000;

interface ReadPair extends RankCheckTaskInput {
  /** One entry per read: the position, or null with no page or no site on it. */
  reads: Array<number | null>;
  /** Whether any read got a results page back. */
  answered: boolean;
}

function key(keywordId: string, device: string) {
  return `${keywordId}:${device}`;
}

function foundPositions(pair: ReadPair) {
  return pair.reads.filter((position) => position !== null);
}

function bestPosition(pair: ReadPair): number | null {
  const found = foundPositions(pair);
  return found.length > 0 ? Math.min(...found) : null;
}

function needsAnotherRead(pair: ReadPair): boolean {
  if (pair.reads.length < MIN_READS_PER_CHECK) return true;
  const found = foundPositions(pair);
  if (found.length < pair.reads.length) return true;
  return Math.max(...found) - Math.min(...found) > READS_AGREE_WITHIN_POSITIONS;
}

/** Every pair, with the first read's saved result. A pair with no row errored. */
async function loadFirstReads(ctx: CheckContext): Promise<ReadPair[]> {
  const snapshots = await RankTrackingRepository.getSnapshotsForRun(ctx.runId);
  const saved = new Map(
    snapshots.map((s) => [key(s.trackingKeywordId, s.device), s.position]),
  );
  return expandToTaskInputs(ctx.keywords, ctx.devices).map((task) => {
    const pairKey = key(task.keywordId, task.device);
    return {
      ...task,
      reads: [saved.get(pairKey) ?? null],
      answered: saved.has(pairKey),
    };
  });
}

/**
 * Add this round's result to each pair that was read, saving any position that
 * beats its best and the first answer for a pair that had none.
 */
async function saveReads(
  runId: string,
  pairs: ReadPair[],
  collected: RankCheckResultWithDevice[],
): Promise<ReadPair[]> {
  const results = new Map(
    collected.map((result) => [key(result.keywordId, result.device), result]),
  );
  const toSave: RankCheckResultWithDevice[] = [];
  const updated = pairs.map((pair) => {
    if (!needsAnotherRead(pair)) return pair;
    const result = results.get(key(pair.keywordId, pair.device));
    const position = result?.position ?? null;
    const best = bestPosition(pair);
    const isBetter = position !== null && (best === null || position < best);
    if (result && (isBetter || !pair.answered)) toSave.push(result);
    return {
      ...pair,
      reads: [...pair.reads, position],
      answered: pair.answered || result !== undefined,
    };
  });
  if (toSave.length > 0) {
    await RankTrackingRepository.upsertSnapshots(
      mapResultsToSnapshotRows(runId, toSave),
    );
  }
  return updated;
}

/**
 * Remove the "not found" of a keyword that ranked in an earlier check or on its
 * other device in this run, so it reads as not checked and keeps its previous
 * position.
 */
async function dropUnconfirmedMisses(
  runId: string,
  configId: string,
  pairs: ReadPair[],
) {
  // The run is still active, so completed runs are all earlier checks.
  const earlier =
    await RankTrackingRepository.getBestPositionsForKeywords(configId);
  const rankedKeywords = new Set([
    ...earlier.flatMap((s) =>
      s.position === null ? [] : [s.trackingKeywordId],
    ),
    ...pairs.flatMap((pair) =>
      bestPosition(pair) === null ? [] : [pair.keywordId],
    ),
  ]);
  const unconfirmed = pairs.filter(
    (pair) => bestPosition(pair) === null && rankedKeywords.has(pair.keywordId),
  );
  if (unconfirmed.length === 0) return;
  await RankTrackingRepository.deleteNotFoundSnapshots(
    unconfirmed.map((pair) => ({
      runId,
      trackingKeywordId: pair.keywordId,
      device: pair.device,
    })),
  );
}

/**
 * Read each pair again through the task queue until it has enough reads that
 * agree, it reaches MAX_READS_PER_CHECK, or `readsEndAt` passes. The clock is
 * read inside the steps, so a replay makes the same decision.
 */
export async function retryRankChecks(
  step: WorkflowStep,
  ctx: CheckContext,
  configId: string,
  readsEndAt: number,
): Promise<void> {
  let { pairs, canReadAgain } = await pgStep(
    step,
    "find-reads",
    COLLECT_STEP_CONFIG,
    async () => ({
      pairs: await loadFirstReads(ctx),
      canReadAgain: Date.now() < readsEndAt,
    }),
  );

  for (let read = 2; read <= MAX_READS_PER_CHECK && canReadAgain; read++) {
    const toRead = pairs.filter(needsAnotherRead);
    if (toRead.length === 0) break;
    console.log(
      `[rank-check] ${ctx.runId} read ${read}: ${toRead.length} check(s)`,
    );
    const label = `read-${read}-`;
    const collected = await runQueuedTasks(step, ctx, toRead, label);
    const readPairs = pairs;
    ({ pairs, canReadAgain } = await pgStep(
      step,
      `${label}save`,
      COLLECT_STEP_CONFIG,
      async () => ({
        pairs: await saveReads(ctx.runId, readPairs, collected),
        canReadAgain: Date.now() < readsEndAt,
      }),
    ));
  }

  const finalPairs = pairs;
  await pgStep(step, "drop-unconfirmed-misses", COLLECT_STEP_CONFIG, () =>
    dropUnconfirmedMisses(ctx.runId, configId, finalPairs),
  );
}
