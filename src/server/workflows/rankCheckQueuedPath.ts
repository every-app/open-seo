import type { WorkflowStep } from "cloudflare:workers";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import {
  fetchRankCheckTaskResult,
  MAX_TASKS_PER_POST,
} from "@/server/lib/dataforseo";
import type {
  PostedRankCheckTask,
  RankCheckResult,
  RankCheckTaskInput,
} from "@/server/lib/dataforseo";
import {
  KEYWORDS_PER_BATCH,
  VALIDATED_CRAWLS_PER_PAIR,
} from "@/shared/rank-tracking";
import { pgStep } from "@/server/workflows/pgStep";
import {
  buildBaselines,
  pairKey,
  validateCollected,
  type PairBaseline,
  type QueuedTask,
} from "@/server/workflows/rankCheckValidation";
import {
  checkBatchLive,
  COLLECT_STEP_CONFIG,
  expandToTaskInputs,
  LIVE_BATCH_STEP_CONFIG,
  mapResultsToSnapshotRows,
  SINGLE_ATTEMPT_STEP_CONFIG,
  type CheckContext,
  type RankCheckResultWithDevice,
} from "@/server/workflows/rankCheckPaths";

// The task-queue path of a rank check (scheduled and validated runs). The live
// path and the pieces both share live in rankCheckPaths.ts, whose "Step bodies"
// note also governs collectQueuedRound and postQueuedChunk here: a step body
// reads only its arguments and returns what the engine persists and replays.

// Poll cadence for queued tasks. Standard-priority tasks complete in ~5
// minutes on average, so the first check waits 4 minutes; cumulative waits are
// 4 / 6 / 8 / 10 / 12 / 15 minutes, after which stragglers fall back to the
// live endpoint.
const QUEUED_POLL_INTERVALS = [
  "4 minutes",
  "2 minutes",
  "2 minutes",
  "2 minutes",
  "2 minutes",
  "3 minutes",
] as const;

// A validated run reposts dropped pairs through round 3 (~10 minutes in), so
// it polls two rounds longer to collect those crawls instead of holding them.
const VALIDATED_POLL_INTERVALS = [
  ...QUEUED_POLL_INTERVALS,
  "3 minutes",
  "3 minutes",
] as const;

/** Concurrent task_get requests within a collect step. */
const TASK_GET_CONCURRENCY = 25;

/** Max task_get calls per collect round (bounds one round's fan-out). */
const TASK_GETS_PER_COLLECT = 500;

// A validated round reads each task's page as well, doubling its calls and
// moving whole Google pages instead of small JSON, so it takes fewer tasks per
// step; the rest wait for the next round.
const VALIDATED_TASK_GETS_PER_COLLECT = 100;

// Reposts stop after this poll round so the new crawl can still be collected
// inside the window QUEUED_POLL_INTERVALS leaves (see runQueuedCheck).
const LAST_REPOST_ROUND = 3;

interface CollectRoundOutcome {
  /** Snapshots written this round. */
  collected: number;
  /** Tasks still in DataForSEO's queue — poll again next round. */
  stillPending: QueuedTask[];
  /** Tasks DataForSEO failed — route to the live fallback. */
  failed: QueuedTask[];
  /** Completed tasks judged a bad page (chip module or off their history). */
  dropped: QueuedTask[];
  /** Completed tasks that passed both checks. */
  validated: number;
  /** Of the dropped, those flagged by the history rule. */
  historySuspect: number;
  /** Completed tasks whose page could not be read this round (read again next round). */
  htmlUnavailable: number;
}

function pairList(tasks: RankCheckTaskInput[]): string {
  return tasks
    .map((t) => `${t.keyword}/${t.device}`)
    .join(", ")
    .slice(0, 500);
}

/**
 * Fetch results for queued tasks (one free task_get each), persist completed
 * snapshots, and update run progress. Transient task_get failures stay
 * pending for the next round. On a validated run each completed result is
 * checked against its own page first (validateCollected). With `saveNotFound`
 * false, a plain result without the domain isn't saved.
 */
async function collectQueuedRound(
  ctx: CheckContext,
  tasks: QueuedTask[],
  saveNotFound: boolean,
): Promise<CollectRoundOutcome> {
  const completed: RankCheckResultWithDevice[] = [];
  const stillPending: QueuedTask[] = [];
  const failed: QueuedTask[] = [];
  const dropped: QueuedTask[] = [];
  let validated = 0;
  let historySuspect = 0;
  let htmlUnavailable = 0;
  // Built from completed runs only, so this run's own writes never feed it.
  const baselines = ctx.validateSerps
    ? buildBaselines(
        await RankTrackingRepository.getRecentSnapshotsForConfig(ctx.configId),
      )
    : new Map<string, PairBaseline>();

  for (let i = 0; i < tasks.length; i += TASK_GET_CONCURRENCY) {
    const chunk = tasks.slice(i, i + TASK_GET_CONCURRENCY);
    const settled = await Promise.allSettled(
      chunk.map((task) =>
        fetchRankCheckTaskResult({
          taskId: task.taskId,
          keywordId: task.keywordId,
          keyword: task.keyword,
          targetDomain: ctx.domain,
        }),
      ),
    );
    const toValidate: Array<{ task: QueuedTask; result: RankCheckResult }> = [];
    settled.forEach((result, index) => {
      const task = chunk[index];
      if (result.status === "rejected") {
        // Transient fetch failure — try again next round.
        console.warn(
          `[rank-check] ${ctx.runId} task_get failed:`,
          result.reason,
        );
        stillPending.push(task);
      } else if (result.value.status === "pending") {
        stillPending.push(task);
      } else if (result.value.status === "failed") {
        console.warn(
          `[rank-check] ${ctx.runId} task ${task.taskId} failed: ${result.value.message}`,
        );
        // No run error here: a live call records it. That is the live
        // fallback, or for a manual retry, the live attempt before the queue.
        // A validated run reports what it held through its stats instead.
        failed.push(task);
      } else if (ctx.validateSerps) {
        toValidate.push({ task, result: result.value.result });
      } else if (saveNotFound || result.value.result.position !== null) {
        completed.push({ ...result.value.result, device: task.device });
      }
    });

    if (toValidate.length > 0) {
      const checked = await validateCollected(ctx, toValidate, baselines);
      completed.push(...checked.completed);
      dropped.push(...checked.dropped);
      stillPending.push(...checked.unread);
      validated += checked.validated;
      historySuspect += checked.historySuspect;
      htmlUnavailable += checked.unread.length;
    }
  }

  if (completed.length > 0) {
    await RankTrackingRepository.insertSnapshots(
      mapResultsToSnapshotRows(ctx.runId, completed),
    );
    // Progress for the UI; finalize recounts from the DB anyway.
    const snapshots = await RankTrackingRepository.getSnapshotsForRun(
      ctx.runId,
    );
    await RankTrackingRepository.updateRun(ctx.runId, {
      keywordsChecked: new Set(snapshots.map((s) => s.trackingKeywordId)).size,
    });
  }

  return {
    collected: completed.length,
    stillPending,
    failed,
    dropped,
    validated,
    historySuspect,
    htmlUnavailable,
  };
}

/**
 * Post one chunk of keyword/device pairs to the queue in a metered step. A
 * failed post must not abort the run — earlier chunks are already charged at
 * DataForSEO — so the pairs the queue did not accept come back as rejected.
 */
async function postQueuedChunk(
  step: WorkflowStep,
  ctx: CheckContext,
  stepName: string,
  chunk: RankCheckTaskInput[],
): Promise<{ posted: PostedRankCheckTask[]; rejected: RankCheckTaskInput[] }> {
  let posted: PostedRankCheckTask[] = [];
  try {
    posted = await pgStep(
      step,
      stepName,
      SINGLE_ATTEMPT_STEP_CONFIG,
      async () =>
        ctx.client.serp.rankCheckTaskPost({
          tasks: chunk,
          locationCode: ctx.locationCode,
          languageCode: ctx.languageCode,
          locationName: ctx.locationName,
          depth: ctx.serpDepth,
          targetDomain: ctx.domain,
        }),
    );
  } catch (error) {
    console.warn(`[rank-check] ${ctx.runId} ${stepName} failed:`, error);
  }
  const accepted = new Set(posted.map(pairKey));
  return {
    posted,
    rejected: chunk.filter((task) => !accepted.has(pairKey(task))),
  };
}

/** Per-run accounting for the queued path, in keyword/device task units. */
export interface QueuedCheckStats {
  /** Tasks accepted into DataForSEO's queue. */
  queueTasks: number;
  /** Task results collected from the queue within the polling window. */
  queueCollected: number;
  /** Tasks routed to the live fallback (rejected, failed, or timed out). */
  fallbackTasks: number;
  /** Fallback tasks that produced a snapshot. */
  fallbackChecked: number;
  /** Validated run: results whose page showed the location applied. */
  validated: number;
  /** Validated run: results judged a bad page (chip module or off history). */
  locationDropped: number;
  /** Validated run: of those, results flagged by the recent-history rule. */
  historySuspect: number;
  /** Validated run: dropped results crawled again. */
  reposted: number;
  /** Validated run: pairs dropped on every crawl, held at their previous position. */
  withheld: number;
  /**
   * Validated run: pairs the queue did not deliver in time or the vendor
   * rejected or failed, held at their previous position because live results
   * cannot be checked against their page.
   */
  undelivered: number;
  /** Validated run: page reads that failed and were retried the next round. */
  htmlUnavailable: number;
}

/**
 * Check keywords via DataForSEO's standard task queue (~30% of live cost).
 * Posts every keyword/device pair (or just taskInputs) as a queued task, then
 * polls task_get for ~15 minutes, writing snapshots incrementally as tasks
 * complete. Anything still unfinished after the polling window — plus tasks
 * DataForSEO rejected or failed — gets one shot at the live endpoint so a run
 * never hangs on a stuck queue, unless `liveFallback` is false (a validated
 * run holds those pairs instead). With `saveNotFound` false, a result without
 * the domain isn't saved. Billing happens at task_post (and per live-fallback
 * batch).
 */
export async function runQueuedCheck(
  step: WorkflowStep,
  ctx: CheckContext,
  {
    taskInputs = expandToTaskInputs(ctx.keywords, ctx.devices),
    liveFallback = true,
    saveNotFound = true,
  }: {
    taskInputs?: RankCheckTaskInput[];
    liveFallback?: boolean;
    saveNotFound?: boolean;
  } = {},
): Promise<QueuedCheckStats> {
  // Post all tasks to the queue, <=100 per request, one metered step each.
  // A failed chunk must not abort the run — earlier chunks were already
  // charged at DataForSEO, so their results have to be collected. The failed
  // chunk's pairs go to the live fallback instead.
  let pending: QueuedTask[] = [];
  const fallback: RankCheckTaskInput[] = [];
  // Validated runs only: pairs held at their previous position.
  const withheld: RankCheckTaskInput[] = [];
  const undelivered: RankCheckTaskInput[] = [];
  for (let i = 0; i < taskInputs.length; i += MAX_TASKS_PER_POST) {
    const chunk = taskInputs.slice(i, i + MAX_TASKS_PER_POST);
    const postIndex = Math.floor(i / MAX_TASKS_PER_POST);
    const { posted, rejected } = await postQueuedChunk(
      step,
      ctx,
      `post-tasks-${postIndex}`,
      chunk,
    );
    pending.push(...posted.map((task) => ({ ...task, attempt: 1 })));
    fallback.push(...rejected);
  }

  const stats: QueuedCheckStats = {
    queueTasks: pending.length,
    queueCollected: 0,
    fallbackTasks: 0,
    fallbackChecked: 0,
    validated: 0,
    locationDropped: 0,
    historySuspect: 0,
    reposted: 0,
    withheld: 0,
    undelivered: 0,
    htmlUnavailable: 0,
  };

  // Poll until everything is collected or the ~15 minute window closes. A
  // collect failure (past its retries) leaves that round's tasks pending for
  // the next round — or the live fallback — instead of failing the run; the
  // posted tasks are already paid for.
  const intervals = ctx.validateSerps
    ? VALIDATED_POLL_INTERVALS
    : QUEUED_POLL_INTERVALS;
  for (let round = 0; round < intervals.length && pending.length > 0; round++) {
    await step.sleep(`wait-${round}`, intervals[round]);

    // Cap task_gets per round so one collect step stays well inside the
    // per-invocation subrequest limit at the 1000-keyword config ceiling; a
    // validated round also reads each task's page, so it takes fewer.
    const cap = ctx.validateSerps
      ? VALIDATED_TASK_GETS_PER_COLLECT
      : TASK_GETS_PER_COLLECT;
    const batch = pending.slice(0, cap);
    const overflow = pending.slice(cap);

    let outcome: CollectRoundOutcome;
    try {
      outcome = await pgStep(
        step,
        `collect-${round}`,
        COLLECT_STEP_CONFIG,
        () => collectQueuedRound(ctx, batch, saveNotFound),
      );
    } catch (error) {
      console.warn(`[rank-check] ${ctx.runId} collect-${round} failed:`, error);
      continue;
    }

    stats.queueCollected += outcome.collected;
    stats.validated += outcome.validated;
    stats.htmlUnavailable += outcome.htmlUnavailable;
    stats.locationDropped += outcome.dropped.length;
    stats.historySuspect += outcome.historySuspect;
    pending = [...outcome.stillPending, ...overflow];
    fallback.push(...outcome.failed);

    // A dropped reading is crawled again while attempts and the window allow;
    // otherwise it is withheld and the keyword keeps its previous position.
    const repost =
      round <= LAST_REPOST_ROUND
        ? outcome.dropped.filter(
            (task) => task.attempt < VALIDATED_CRAWLS_PER_PAIR,
          )
        : [];
    withheld.push(...outcome.dropped.filter((task) => !repost.includes(task)));
    for (let i = 0; i < repost.length; i += MAX_TASKS_PER_POST) {
      const chunk = repost.slice(i, i + MAX_TASKS_PER_POST);
      const chunkIndex = Math.floor(i / MAX_TASKS_PER_POST);
      const attempts = new Map(
        chunk.map((task) => [pairKey(task), task.attempt]),
      );
      const { posted, rejected } = await postQueuedChunk(
        step,
        ctx,
        `repost-${round}-${chunkIndex}`,
        chunk,
      );
      pending.push(
        ...posted.map((task) => ({
          ...task,
          attempt: (attempts.get(pairKey(task)) ?? 1) + 1,
        })),
      );
      stats.reposted += posted.length;
      undelivered.push(...rejected);
    }
  }

  if (ctx.validateSerps) {
    // Live results cannot be checked against their page, so a validated run
    // holds what the queue did not deliver instead of falling back. Finalize
    // writes the held counts into the run's message from these stats.
    undelivered.push(...pending, ...fallback);
    stats.withheld = withheld.length;
    stats.undelivered = undelivered.length;
    if (withheld.length > 0) {
      console.warn(
        `[rank-check] ${ctx.runId} held ${withheld.length} reading(s) judged bad on every crawl: ${pairList(withheld)}`,
      );
    }
    if (undelivered.length > 0) {
      console.warn(
        `[rank-check] ${ctx.runId} held ${undelivered.length} undelivered reading(s): ${pairList(undelivered)}`,
      );
    }
    return stats;
  }

  // Live fallback: queued tasks that never finished, failed, or were rejected
  // at post time. A straggler is double-billed (customer was metered the
  // queued post cost and now the live call too — fractions of a cent).
  // Progress isn't updated here; finalize recounts keywordsChecked from the
  // DB.
  const stragglers: RankCheckTaskInput[] = [...fallback, ...pending];
  if (stragglers.length === 0) return stats;
  if (!liveFallback) {
    console.log(
      `[rank-check] ${ctx.runId} ${stragglers.length} task(s) left unchecked, no live fallback`,
    );
    return stats;
  }
  stats.fallbackTasks = stragglers.length;

  console.log(
    `[rank-check] ${ctx.runId} live fallback for ${stragglers.length} task(s)`,
  );

  for (let i = 0; i < stragglers.length; i += KEYWORDS_PER_BATCH) {
    const batch = stragglers.slice(i, i + KEYWORDS_PER_BATCH);
    const batchIndex = Math.floor(i / KEYWORDS_PER_BATCH);

    stats.fallbackChecked += await pgStep(
      step,
      `fallback-batch-${batchIndex}`,
      LIVE_BATCH_STEP_CONFIG,
      () => checkBatchLive(ctx, batch),
    );
  }

  return stats;
}
