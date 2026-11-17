import type { WorkflowStep } from "cloudflare:workers";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import type {
  PostedRankCheckTask,
  RankCheckTaskInput,
} from "@/server/lib/dataforseo";
import { MAX_READS_PER_CHECK } from "@/shared/rank-tracking";
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
// Second reads. Google serves some scraped searches a fake results page that
// leaves out sites that really rank. DataForSEO replaces those pages
// (resolve_poisoned_results), but a miss on a keyword that ranked before is
// still the likeliest sign of one it didn't catch, so that pair is read once
// more, as is a pair whose first read got no page back. The best position
// wins.
// ---------------------------------------------------------------------------

/**
 * No second read starts after this long. One read polls for up to an hour, so
 * a check ends in about two hours, and a first read DataForSEO delays past the
 * window gets no second.
 */
export const READ_WINDOW_MS = 60 * 60_000;

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

function bestPosition(pair: PairReads): number | null {
  const found = pair.reads.filter((position) => position !== null);
  return found.length > 0 ? Math.min(...found) : null;
}

/**
 * Keywords that ranked in an earlier check (`rankedEarlier`, per task) or on
 * either device in this run. A miss on one of these is suspect.
 */
function rankedKeywords(
  tasks: RankCheckTaskInput[],
  pairs: PairReads[],
  rankedEarlier: boolean[],
): Set<string> {
  return new Set(
    tasks.flatMap((task, index) =>
      rankedEarlier[index] || bestPosition(pairs[index]) !== null
        ? [task.keywordId]
        : [],
    ),
  );
}

function isSuspectMiss(pair: PairReads, keywordRanked: boolean): boolean {
  return pair.answered && bestPosition(pair) === null && keywordRanked;
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

/** Whether each task's keyword ranked in a completed earlier check. */
async function loadRankedEarlier(
  configId: string,
  tasks: RankCheckTaskInput[],
): Promise<boolean[]> {
  // The run is still active, so completed runs are all earlier checks.
  const earlier =
    await RankTrackingRepository.getBestPositionsForKeywords(configId);
  const ranked = new Set(
    earlier.flatMap((s) => (s.position === null ? [] : [s.trackingKeywordId])),
  );
  return tasks.map((task) => ranked.has(task.keywordId));
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
async function dropSuspectMisses(
  runId: string,
  tasks: RankCheckTaskInput[],
  pairs: PairReads[],
  rankedEarlier: boolean[],
) {
  const ranked = rankedKeywords(tasks, pairs, rankedEarlier);
  const suspect = tasks.filter(
    (task, index) =>
      bestPosition(pairs[index]) === null && ranked.has(task.keywordId),
  );
  if (suspect.length === 0) return;
  await RankTrackingRepository.deleteNotFoundSnapshots(
    suspect.map((task) => ({
      runId,
      trackingKeywordId: task.keywordId,
      device: task.device,
    })),
  );
}

/**
 * Read a pair once more through the task queue when its first read got no
 * page back or missed a keyword that ranked, as long as `readsEndAt` hasn't
 * passed. The `firstReadStragglers` the first read left queued are collected
 * alongside, and a pair never has two tasks queued. The clock is read inside
 * the steps, so a replay makes the same decision. Reads are numbered across
 * passes for step labels only; MAX_READS_PER_CHECK caps each pair's reads.
 */
export async function retryRankChecks(
  step: WorkflowStep,
  ctx: CheckContext,
  configId: string,
  readsEndAt: number,
  firstReadStragglers: PostedRankCheckTask[] = [],
): Promise<void> {
  const tasks = expandToTaskInputs(ctx.keywords, ctx.devices);
  let stragglers = firstReadStragglers;
  let { pairs, canReadAgain } = await pgStep(
    step,
    "find-reads",
    COLLECT_STEP_CONFIG,
    async () => ({
      pairs: await loadFirstReads(
        ctx.runId,
        tasks,
        new Set(firstReadStragglers.map(key)),
      ),
      canReadAgain: Date.now() < readsEndAt,
    }),
  );
  const rankedEarlier = await pgStep(
    step,
    "find-ranked-earlier",
    COLLECT_STEP_CONFIG,
    () => loadRankedEarlier(configId, tasks),
  );

  for (let read = 2; ; ) {
    const readPairs = pairs;
    const carried = stragglers;
    const waiting = new Set(carried.map(key));
    const ranked = rankedKeywords(tasks, readPairs, rankedEarlier);
    const toRead = canReadAgain
      ? tasks.filter((task, index) => {
          const pair = readPairs[index];
          return (
            !waiting.has(key(task)) &&
            pair.reads.length < MAX_READS_PER_CHECK &&
            (!pair.answered || isSuspectMiss(pair, ranked.has(task.keywordId)))
          );
        })
      : [];
    if (toRead.length === 0 && carried.length === 0) break;
    console.log(
      `[rank-check] ${ctx.runId} read ${read}: ${toRead.length} check(s), ${carried.length} still queued`,
    );
    // With nothing to post, this only waits for the first read's tasks still
    // queued, so the next pass can give their pairs a second read: no label
    // is used twice. Second reads don't move on without their stragglers, so
    // the loop ends once every pair is read.
    const isRead = toRead.length > 0;
    const label = isRead ? `read-${read}-` : `read-${read}-queued-`;
    const outcome = await runQueuedTasks(step, ctx, toRead, label, {
      carried,
    });
    stragglers = outcome.stragglers;
    const polled = new Set([...waiting, ...toRead.map(key)]);
    const queued = new Set(stragglers.map(key));
    ({ pairs, canReadAgain } = await pgStep(
      step,
      `${label}save`,
      COLLECT_STEP_CONFIG,
      async () => ({
        pairs: await saveReads(ctx.runId, tasks, readPairs, {
          polled,
          queued,
          collected: outcome.collected,
        }),
        canReadAgain: Date.now() < readsEndAt,
      }),
    ));
    if (isRead) read++;
  }

  const finalPairs = pairs;
  await pgStep(step, "drop-unconfirmed-misses", COLLECT_STEP_CONFIG, () =>
    dropSuspectMisses(ctx.runId, tasks, finalPairs, rankedEarlier),
  );
}
