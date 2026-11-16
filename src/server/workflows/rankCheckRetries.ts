import type { WorkflowStep } from "cloudflare:workers";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import type {
  PostedRankCheckTask,
  RankCheckTaskInput,
} from "@/server/lib/dataforseo";
import {
  MAX_READS_PER_CHECK,
  MIN_READS_PER_CHECK,
} from "@/shared/rank-tracking";
import { pgStep } from "@/server/workflows/pgStep";
import {
  COLLECT_STEP_CONFIG,
  expandToTaskInputs,
  mapResultsToSnapshotRows,
  QUEUED_POLL_INTERVALS,
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
 * No new round of reads starts after this long, except the reads
 * MIN_READS_PER_CHECK still owes (OWED_READS_GRACE_MS). One round polls for up
 * to an hour, so a check ends in about two hours. Slow rounds get fewer reads,
 * and a first read DataForSEO delays past the window gets none.
 */
export const READ_WINDOW_MS = 60 * 60_000;

/**
 * How long after the window a read may still start for the pairs that have
 * fewer than MIN_READS_PER_CHECK. At 100 results a keyword DataForSEO takes
 * about 18 minutes over a task, so the third read of a large tracker starts
 * close to the end of the window. A read that starts in the grace polls for
 * OWED_READ_POLL_INTERVALS, so the check still ends within two hours.
 */
const OWED_READS_GRACE_MS = 15 * 60_000;

/** The usual polls without the last, 15 minutes shorter. */
const OWED_READ_POLL_INTERVALS = QUEUED_POLL_INTERVALS.slice(0, -1);

/**
 * What the reads of one keyword/device pair found. Steps return these in
 * expandToTaskInputs order, without the keyword: a step's output is capped at
 * 1 MiB, which the largest tracker's keyword text alone could fill.
 */
interface PairReads {
  /** One entry per read: the position, or null with no page or no site on it. */
  reads: Array<number | null>;
  /** Whether any read got a results page back. */
  answered: boolean;
}

function key(pair: { keywordId: string; device: string }) {
  return `${pair.keywordId}:${pair.device}`;
}

function foundPositions(pair: PairReads) {
  return pair.reads.filter((position) => position !== null);
}

function bestPosition(pair: PairReads): number | null {
  const found = foundPositions(pair);
  return found.length > 0 ? Math.min(...found) : null;
}

function needsAnotherRead(pair: PairReads): boolean {
  if (pair.reads.length < MIN_READS_PER_CHECK) return true;
  const found = foundPositions(pair);
  if (found.length < pair.reads.length) return true;
  return Math.max(...found) - Math.min(...found) > READS_AGREE_WITHIN_POSITIONS;
}

/**
 * Every pair's first read, from its saved result. A pair with no row errored,
 * unless its task is still `queued`: then it has no read yet.
 */
async function loadFirstReads(
  runId: string,
  tasks: RankCheckTaskInput[],
  queued: Set<string>,
): Promise<PairReads[]> {
  const snapshots = await RankTrackingRepository.getSnapshotsForRun(runId);
  const saved = new Map(
    snapshots.map((s) => [
      key({ keywordId: s.trackingKeywordId, device: s.device }),
      s.position,
    ]),
  );
  return tasks.map((task) => {
    const pairKey = key(task);
    if (!saved.has(pairKey) && queued.has(pairKey)) {
      return { reads: [], answered: false };
    }
    return {
      reads: [saved.get(pairKey) ?? null],
      answered: saved.has(pairKey),
    };
  });
}

/**
 * Add this round's result to each pair that was `polled`, saving any position
 * that beats its best and the first answer for a pair that had none. A pair
 * whose task is still `queued` gets its read when the task is collected.
 */
async function saveReads(
  runId: string,
  tasks: RankCheckTaskInput[],
  pairs: PairReads[],
  {
    polled,
    queued,
    collected,
  }: {
    polled: Set<string>;
    queued: Set<string>;
    collected: RankCheckResultWithDevice[];
  },
): Promise<PairReads[]> {
  const results = new Map(collected.map((result) => [key(result), result]));
  const toSave: RankCheckResultWithDevice[] = [];
  const updated = pairs.map((pair, index) => {
    const pairKey = key(tasks[index]);
    if (!polled.has(pairKey)) return pair;
    const result = results.get(pairKey);
    if (!result && queued.has(pairKey)) return pair;
    const position = result?.position ?? null;
    const best = bestPosition(pair);
    const isBetter = position !== null && (best === null || position < best);
    if (result && (isBetter || !pair.answered)) toSave.push(result);
    return {
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
  tasks: RankCheckTaskInput[],
  pairs: PairReads[],
) {
  // The run is still active, so completed runs are all earlier checks.
  const earlier =
    await RankTrackingRepository.getBestPositionsForKeywords(configId);
  const rankedKeywords = new Set([
    ...earlier.flatMap((s) =>
      s.position === null ? [] : [s.trackingKeywordId],
    ),
    ...tasks.flatMap((task, index) =>
      bestPosition(pairs[index]) === null ? [] : [task.keywordId],
    ),
  ]);
  const unconfirmed = tasks.filter(
    (task, index) =>
      bestPosition(pairs[index]) === null && rankedKeywords.has(task.keywordId),
  );
  if (unconfirmed.length === 0) return;
  await RankTrackingRepository.deleteNotFoundSnapshots(
    unconfirmed.map((task) => ({
      runId,
      trackingKeywordId: task.keywordId,
      device: task.device,
    })),
  );
}

/**
 * Read each pair again through the task queue until it has enough reads that
 * agree, it reaches MAX_READS_PER_CHECK, or `readsEndAt` passes. A pair short
 * of MIN_READS_PER_CHECK can be read for a little longer. A read moves
 * on without its last few tasks (see STRAGGLER_SHARE in rankCheckPaths.ts):
 * the next read collects them and leaves their pairs out, so a pair never has
 * two tasks queued. The clock is read inside the steps, so a replay makes the
 * same decision.
 */
export async function retryRankChecks(
  step: WorkflowStep,
  ctx: CheckContext,
  configId: string,
  readsEndAt: number,
  firstReadStragglers: PostedRankCheckTask[] = [],
): Promise<void> {
  const tasks = expandToTaskInputs(ctx.keywords, ctx.devices);
  const readClock = () => ({
    canReadAgain: Date.now() < readsEndAt,
    canFinishReads: Date.now() < readsEndAt + OWED_READS_GRACE_MS,
  });
  let stragglers = firstReadStragglers;
  let { pairs, canReadAgain, canFinishReads } = await pgStep(
    step,
    "find-reads",
    COLLECT_STEP_CONFIG,
    async () => ({
      pairs: await loadFirstReads(
        ctx.runId,
        tasks,
        new Set(firstReadStragglers.map(key)),
      ),
      ...readClock(),
    }),
  );

  for (let read = 2; ; ) {
    const readPairs = pairs;
    const carried = stragglers;
    const waiting = new Set(carried.map(key));
    // Past the window, only the reads every pair is owed.
    const isOwedOnly = !canReadAgain;
    const wantsRead = (pair: PairReads) =>
      isOwedOnly
        ? canFinishReads && pair.reads.length < MIN_READS_PER_CHECK
        : needsAnotherRead(pair);
    const toRead =
      read <= MAX_READS_PER_CHECK
        ? tasks.filter(
            (task, index) =>
              wantsRead(readPairs[index]) && !waiting.has(key(task)),
          )
        : [];
    if (toRead.length === 0 && carried.length === 0) break;
    console.log(
      `[rank-check] ${ctx.runId} read ${read}: ${toRead.length} check(s), ${carried.length} still queued`,
    );
    // With nothing to post, this only waits for the tasks still queued. It
    // never moves on, so the next pass posts read `read` or ends: no label
    // is used twice. Nor does the last read, which has no next one.
    const isRead = toRead.length > 0;
    const label = isRead ? `read-${read}-` : `read-${read}-queued-`;
    const outcome = await runQueuedTasks(step, ctx, toRead, label, {
      carried,
      pollIntervals:
        isRead && isOwedOnly ? OWED_READ_POLL_INTERVALS : QUEUED_POLL_INTERVALS,
      moveOnUntil:
        isRead && !isOwedOnly && read < MAX_READS_PER_CHECK
          ? readsEndAt
          : undefined,
    });
    stragglers = outcome.stragglers;
    const polled = new Set([...waiting, ...toRead.map(key)]);
    const queued = new Set(stragglers.map(key));
    ({ pairs, canReadAgain, canFinishReads } = await pgStep(
      step,
      `${label}save`,
      COLLECT_STEP_CONFIG,
      async () => ({
        pairs: await saveReads(ctx.runId, tasks, readPairs, {
          polled,
          queued,
          collected: outcome.collected,
        }),
        ...readClock(),
      }),
    ));
    if (isRead) read++;
  }

  const finalPairs = pairs;
  await pgStep(step, "drop-unconfirmed-misses", COLLECT_STEP_CONFIG, () =>
    dropUnconfirmedMisses(ctx.runId, configId, tasks, finalPairs),
  );
}
