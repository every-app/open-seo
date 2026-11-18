import type { WorkflowStep } from "cloudflare:workers";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import {
  fetchRankCheckTaskResult,
  MAX_TASKS_PER_POST,
} from "@/server/lib/dataforseo";
import type {
  createDataforseoClient,
  PostedRankCheckTask,
  RankCheckResult,
  RankCheckTaskInput,
} from "@/server/lib/dataforseo";
import type { RankTrackingConfig } from "@/types/schemas/rank-tracking";
import { pgStep } from "@/server/workflows/pgStep";

const SINGLE_ATTEMPT_STEP_CONFIG = {
  retries: { limit: 0, delay: "1 second" as const },
  timeout: "2 minutes" as const,
};

type KeywordEntry = { id: string; keyword: string };
export type RankCheckResultWithDevice = RankCheckResult & {
  device: "desktop" | "mobile";
};

export function mapResultsToSnapshotRows(
  runId: string,
  results: RankCheckResultWithDevice[],
) {
  return results.map((r) => ({
    runId,
    trackingKeywordId: r.keywordId,
    keyword: r.keyword,
    device: r.device,
    position: r.position,
    url: r.url,
    serpFeatures:
      r.serpFeatures.length > 0 ? JSON.stringify(r.serpFeatures) : null,
  }));
}

export interface CheckContext {
  client: ReturnType<typeof createDataforseoClient>;
  keywords: KeywordEntry[];
  devices: RankTrackingConfig["devices"];
  serpDepth: number;
  domain: string;
  locationCode: number;
  languageCode: string;
  locationName?: string;
  runId: string;
}

/** Expand keywords into one task input per keyword/device pair. */
export function expandToTaskInputs(
  keywords: KeywordEntry[],
  devices: RankTrackingConfig["devices"],
): RankCheckTaskInput[] {
  const deviceList: Array<"desktop" | "mobile"> =
    devices === "both" ? ["desktop", "mobile"] : [devices];
  return keywords.flatMap((kw) =>
    deviceList.map((device) => ({
      keyword: kw.keyword,
      keywordId: kw.id,
      device,
    })),
  );
}

// Poll cadence for queued tasks. Standard-priority tasks usually complete in
// ~5 minutes, so the first check waits 4 minutes and polls are frequent up to
// 15 minutes, every 5 minutes up to 30 so slow rounds still leave time for more
// reads inside READ_WINDOW_MS, then sparse up to an hour. Collecting a slow
// task is free while re-posting it is billed again, so a read gives up on
// unfinished tasks only after that. Cumulative waits: 4 / 6 / 8 / 10 / 12 / 15 /
// 20 / 25 / 30 / 45 / 60 minutes.
const QUEUED_POLL_INTERVALS: WorkflowSleepDuration[] = [
  "4 minutes",
  "2 minutes",
  "2 minutes",
  "2 minutes",
  "2 minutes",
  "3 minutes",
  "5 minutes",
  "5 minutes",
  "5 minutes",
  "15 minutes",
  "15 minutes",
];

// The first read keeps waiting when DataForSEO's queue is backed up, every 30
// minutes up to 6 hours (the limit the delayed notice in RankRunAlerts names),
// since those tasks are already paid for. It stays well inside
// STUCK_RUN_AFTER_MS.
const FIRST_READ_POLL_INTERVALS: WorkflowSleepDuration[] = [
  ...QUEUED_POLL_INTERVALS,
  ...Array<WorkflowSleepDuration>(10).fill("30 minutes"),
];

/** Concurrent task_get requests within a collect step. */
const TASK_GET_CONCURRENCY = 25;

// Every batch of TASK_GET_CONCURRENCY task_gets takes at least this long, so
// one check sends at most 1,500 a minute however fast DataForSEO answers. The
// scheduler's limit on checks in flight (scheduledRankChecks.ts) is sized on
// that figure against DataForSEO's 10,000 requests a minute. Measured, a batch
// takes about 1.2 seconds, so a tracker of 5,000 keywords on both devices
// (10,000 tasks) is polled once in about 8 minutes.
const TASK_GET_BATCH_MS = 1000;

/** Max task_get calls per collect step. A poll round runs one step per chunk. */
const TASK_GETS_PER_COLLECT = 500;

// DataForSEO finishes nearly all of a read's tasks within minutes of each
// other and a few much later. A first read that waited for those would hold up
// a large tracker's second reads, so once this share or less of its tasks is
// still queued the second read starts and those tasks are collected alongside
// it. Below 50 tasks the share rounds to none.
const STRAGGLER_SHARE = 0.02;

// Collect steps may issue hundreds of task_get calls, so they get more room
// than SINGLE_ATTEMPT_STEP_CONFIG's 2-minute timeout. Unlike the metered
// steps, retrying is safe and free: task_get isn't charged and snapshot
// writes are idempotent.
export const COLLECT_STEP_CONFIG = {
  retries: { limit: 2, delay: "10 seconds" as const },
  timeout: "5 minutes" as const,
};

/**
 * Fetch results for queued tasks (one free task_get each). Transient task_get
 * failures stay pending for the next round; tasks DataForSEO failed are
 * dropped.
 */
async function fetchQueuedRound(
  ctx: CheckContext,
  tasks: PostedRankCheckTask[],
  paced: boolean,
): Promise<{
  completed: RankCheckResultWithDevice[];
  stillPending: PostedRankCheckTask[];
}> {
  const completed: RankCheckResultWithDevice[] = [];
  const stillPending: PostedRankCheckTask[] = [];

  for (let i = 0; i < tasks.length; i += TASK_GET_CONCURRENCY) {
    const chunk = tasks.slice(i, i + TASK_GET_CONCURRENCY);
    const [settled] = await Promise.all([
      Promise.allSettled(
        chunk.map((task) =>
          fetchRankCheckTaskResult({
            taskId: task.taskId,
            keywordId: task.keywordId,
            keyword: task.keyword,
            targetDomain: ctx.domain,
          }),
        ),
      ),
      paced && new Promise((resolve) => setTimeout(resolve, TASK_GET_BATCH_MS)),
    ]);
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
      } else {
        completed.push({ ...result.value.result, device: task.device });
      }
    });
  }
  return { completed, stillPending };
}

/**
 * Post tasks to DataForSEO's standard queue (~30% of live cost), one metered
 * step per 100, then poll task_get on `pollIntervals`, along with the
 * `carried` tasks an earlier read left queued. `onCollected` runs inside each
 * collect step with that round's results. A task that's rejected or fails gets
 * no result. While the clock is before `moveOnUntil`, polling ends once only
 * stragglers are left and returns them to carry into the next read. Polling
 * that runs out of intervals gives up on what is left: `timedOut`.
 */
export async function runQueuedTasks(
  step: WorkflowStep,
  ctx: CheckContext,
  tasks: RankCheckTaskInput[],
  label: string,
  {
    onCollected,
    pollIntervals = QUEUED_POLL_INTERVALS,
    carried = [],
    moveOnUntil,
  }: {
    onCollected?: (results: RankCheckResultWithDevice[]) => Promise<void>;
    pollIntervals?: WorkflowSleepDuration[];
    carried?: PostedRankCheckTask[];
    moveOnUntil?: number;
  } = {},
): Promise<{
  collected: RankCheckResultWithDevice[];
  stragglers: PostedRankCheckTask[];
  timedOut: boolean;
}> {
  // A failed post must not abort the run: earlier chunks were already
  // charged at DataForSEO, so their results have to be collected.
  let pending = [...carried];
  for (let i = 0; i < tasks.length; i += MAX_TASKS_PER_POST) {
    const chunk = tasks.slice(i, i + MAX_TASKS_PER_POST);
    const postLabel = `${label}post-tasks-${Math.floor(i / MAX_TASKS_PER_POST)}`;
    try {
      pending.push(
        ...(await pgStep(step, postLabel, SINGLE_ATTEMPT_STEP_CONFIG, () =>
          ctx.client.serp.rankCheckTaskPost({
            tasks: chunk,
            locationCode: ctx.locationCode,
            languageCode: ctx.languageCode,
            locationName: ctx.locationName,
            depth: ctx.serpDepth,
          }),
        )),
      );
    } catch (error) {
      console.warn(`[rank-check] ${ctx.runId} ${postLabel} failed:`, error);
    }
  }
  const collected: RankCheckResultWithDevice[] = [];
  const fewEnoughToCarry = Math.floor(pending.length * STRAGGLER_SHARE);

  // A collect failure (past its retries) leaves that step's tasks pending for
  // the next round instead of failing the run.
  for (
    let round = 0;
    round < pollIntervals.length && pending.length > 0;
    round++
  ) {
    await step.sleep(`${label}wait-${round}`, pollIntervals[round]);

    // One step per TASK_GETS_PER_COLLECT tasks keeps each step's task_gets
    // and its output small. Every pending task is polled each round, oldest
    // first: a task left unpolled when polling ends is read again and billed
    // again.
    const paced = pending.length > TASK_GET_CONCURRENCY;
    const stillPending: PostedRankCheckTask[] = [];
    let canMoveOn = false;
    for (let i = 0; i < pending.length; i += TASK_GETS_PER_COLLECT) {
      const batch = pending.slice(i, i + TASK_GETS_PER_COLLECT);
      // The first chunk keeps the name a round's only step had, so a run in
      // flight across a deploy replays its finished steps.
      const chunk = i / TASK_GETS_PER_COLLECT;
      const collectLabel = `${label}collect-${round}${chunk > 0 ? `-${chunk}` : ""}`;
      try {
        // Results come back as the step's output, so a replay sees them too,
        // and so does the clock reading that decides whether to move on.
        const outcome = await pgStep(
          step,
          collectLabel,
          COLLECT_STEP_CONFIG,
          async () => {
            const fetched = await fetchQueuedRound(ctx, batch, paced);
            if (onCollected && fetched.completed.length > 0) {
              await onCollected(fetched.completed);
            }
            return {
              ...fetched,
              canMoveOn: moveOnUntil !== undefined && Date.now() < moveOnUntil,
            };
          },
        );
        collected.push(...outcome.completed);
        stillPending.push(...outcome.stillPending);
        canMoveOn = outcome.canMoveOn;
      } catch (error) {
        console.warn(
          `[rank-check] ${ctx.runId} ${collectLabel} failed:`,
          error,
        );
        stillPending.push(...batch);
        canMoveOn = false;
      }
    }
    pending = stillPending;
    if (canMoveOn && pending.length > 0 && pending.length <= fewEnoughToCarry) {
      return { collected, stragglers: pending, timedOut: false };
    }
  }
  return { collected, stragglers: [], timedOut: pending.length > 0 };
}

/**
 * Read every keyword/device pair once through the task queue, writing snapshots
 * as tasks complete. Billing happens at task_post. Further reads are made by
 * retryRankChecks, which also collects the `stragglers` this read left queued.
 * `timedOut` is true when some tasks never left DataForSEO's queue.
 */
export async function runQueuedCheck(
  step: WorkflowStep,
  ctx: CheckContext,
  readsEndAt: number,
): Promise<{ stragglers: PostedRankCheckTask[]; timedOut: boolean }> {
  const { stragglers, timedOut } = await runQueuedTasks(
    step,
    ctx,
    expandToTaskInputs(ctx.keywords, ctx.devices),
    "",
    {
      onCollected: async (results) => {
        await RankTrackingRepository.insertSnapshots(
          mapResultsToSnapshotRows(ctx.runId, results),
        );
        // Progress for the UI; finalize recounts from the DB anyway.
        const snapshots = await RankTrackingRepository.getSnapshotsForRun(
          ctx.runId,
        );
        await RankTrackingRepository.updateRun(ctx.runId, {
          keywordsChecked: new Set(snapshots.map((s) => s.trackingKeywordId))
            .size,
        });
      },
      pollIntervals: FIRST_READ_POLL_INTERVALS,
      moveOnUntil: readsEndAt,
    },
  );
  return { stragglers, timedOut };
}
