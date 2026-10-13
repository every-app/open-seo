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
import { AppError } from "@/server/lib/errors";
import type { RankTrackingConfig } from "@/types/schemas/rank-tracking";
import {
  KEYWORDS_PER_BATCH,
  SUBREQUEST_LIMIT_ERROR,
} from "@/shared/rank-tracking";
import { pgStep } from "@/server/workflows/pgStep";

const SINGLE_ATTEMPT_STEP_CONFIG = {
  retries: { limit: 0, delay: "1 second" as const },
  timeout: "2 minutes" as const,
};

export function isSubrequestLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /too many subrequests/i.test(message);
}

// Overwrites earlier per-keyword errors, which would hide why the rest is blank.
async function recordSubrequestLimit(runId: string) {
  await RankTrackingRepository.updateRun(runId, {
    errorMessage: SUBREQUEST_LIMIT_ERROR,
  });
}

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

// ---------------------------------------------------------------------------
// Step bodies. Each runs inside a single step.do: inputs are its parameters,
// the return value is what the workflow engine persists and replays. They must
// not touch any mutable state outside their arguments.
// ---------------------------------------------------------------------------

/**
 * Check keyword/device pairs against the live endpoint and persist snapshots.
 * The batch is billed with one credit hold and one settle. Per-call failures
 * are logged and skipped; if the hold itself fails, no call runs and every
 * pair fails with that error. Returns the snapshot count written, or throws
 * after persisting if a call hit the platform subrequest limit.
 */
async function checkBatchLive(
  ctx: CheckContext,
  tasks: RankCheckTaskInput[],
): Promise<number> {
  let settled: PromiseSettledResult<RankCheckResult>[];
  try {
    settled = await ctx.client.serp.rankCheckBatch(
      tasks.map((task) => ({
        keyword: task.keyword,
        keywordId: task.keywordId,
        locationCode: ctx.locationCode,
        languageCode: ctx.languageCode,
        locationName: ctx.locationName,
        device: task.device,
        targetDomain: ctx.domain,
        depth: ctx.serpDepth,
      })),
    );
  } catch (error) {
    settled = tasks.map(() => ({ status: "rejected", reason: error }));
  }
  const results: RankCheckResultWithDevice[] = [];
  let firstError: string | null = null;
  let limitError: string | null = null;
  settled.forEach((outcome, index) => {
    if (outcome.status === "fulfilled") {
      results.push({ ...outcome.value, device: tasks[index].device });
      return;
    }
    const reason: unknown = outcome.reason;
    const code = reason instanceof AppError ? reason.code : "UNKNOWN";
    const message = reason instanceof Error ? reason.message : String(reason);
    if (isSubrequestLimitError(reason)) limitError ??= message;
    // Store the bare code so the app shows its provider-unavailable copy;
    // DataForSEO's raw outage text ("Internal Server Error.") reads like our
    // server broke.
    firstError ??= code === "UPSTREAM_UNAVAILABLE" ? code : message;
    // DataForSEO erring on its own side is a provider flake, not our bug: the
    // keyword just misses this run and finalize reports it to the user. Every
    // other rejection (no credits, bad API key) is ours and stays at error.
    const log = code === "UPSTREAM_UNAVAILABLE" ? console.warn : console.error;
    const task = tasks[index];
    log(
      `[rank-check] ${ctx.runId} live call failed (${code}) keyword="${task.keyword}" device=${task.device}: ${message}`,
    );
  });
  if (limitError) {
    await recordSubrequestLimit(ctx.runId);
  } else if (firstError) {
    await RankTrackingRepository.setRunErrorIfEmpty(ctx.runId, firstError);
  }
  if (results.length > 0) {
    await RankTrackingRepository.insertSnapshots(
      mapResultsToSnapshotRows(ctx.runId, results),
    );
  }
  // Throw instead of returning a flag so cached step results stay a number.
  if (limitError) throw new Error(limitError);
  return results.length;
}

/**
 * Check keywords via Live API, parallel devices per keyword, real-time progress.
 * Snapshots are written incrementally after each batch so partial results
 * survive batch failures. ~6s per keyword batch.
 * Each batch is billed with one credit hold and one settle (checkBatchLive).
 * A failed batch step doesn't stop the run; its pairs are retried by
 * retryRankChecks. A batch that hits the platform subrequest limit does, since
 * every later call would fail the same way. Returns whether that happened.
 */
export async function runLiveCheck(
  step: WorkflowStep,
  ctx: CheckContext,
): Promise<boolean> {
  for (let i = 0; i < ctx.keywords.length; i += KEYWORDS_PER_BATCH) {
    const keywordBatch = ctx.keywords.slice(i, i + KEYWORDS_PER_BATCH);
    const batchTasks = expandToTaskInputs(keywordBatch, ctx.devices);
    const batchIndex = Math.floor(i / KEYWORDS_PER_BATCH);
    const keywordsChecked = i + keywordBatch.length;

    try {
      await pgStep(
        step,
        `live-batch-${batchIndex}`,
        SINGLE_ATTEMPT_STEP_CONFIG,
        async () => {
          const written = await checkBatchLive(ctx, batchTasks);
          // Progress for the UI; finalize recounts from the DB anyway.
          await RankTrackingRepository.updateRun(ctx.runId, {
            keywordsChecked,
          });
          return written;
        },
      );
    } catch (error) {
      console.warn(
        `[rank-check] ${ctx.runId} live-batch-${batchIndex} failed:`,
        error,
      );
      if (isSubrequestLimitError(error)) return true;
    }
  }
  return false;
}

// Poll cadence for queued tasks. Standard-priority tasks complete in ~5
// minutes on average, so the first check waits 4 minutes; cumulative waits are
// 4 / 6 / 8 / 10 / 12 / 15 minutes, after which unfinished tasks are left for
// retryRankChecks.
const QUEUED_POLL_INTERVALS = [
  "4 minutes",
  "2 minutes",
  "2 minutes",
  "2 minutes",
  "2 minutes",
  "3 minutes",
] as const;

/** Concurrent task_get requests within a collect step. */
const TASK_GET_CONCURRENCY = 25;

/** Max task_get calls per collect round (bounds one round's fan-out). */
const TASK_GETS_PER_COLLECT = 500;

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
 * dropped. A chunk that hits the platform subrequest limit stops the round
 * and records the limit on the run.
 */
async function fetchQueuedRound(
  ctx: CheckContext,
  tasks: PostedRankCheckTask[],
): Promise<{
  completed: RankCheckResultWithDevice[];
  stillPending: PostedRankCheckTask[];
  /** Optional so results cached before this field existed still replay. */
  subrequestLimited?: boolean;
}> {
  const completed: RankCheckResultWithDevice[] = [];
  const stillPending: PostedRankCheckTask[] = [];
  let subrequestLimited = false;

  for (
    let i = 0;
    i < tasks.length && !subrequestLimited;
    i += TASK_GET_CONCURRENCY
  ) {
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
    subrequestLimited = settled.some(
      (result) =>
        result.status === "rejected" && isSubrequestLimitError(result.reason),
    );
  }
  if (subrequestLimited) await recordSubrequestLimit(ctx.runId);
  return { completed, stillPending, subrequestLimited };
}

/**
 * Post tasks to DataForSEO's standard queue (~30% of live cost), one metered
 * step per 100, then poll task_get for ~15 minutes. `onCollected` runs inside
 * each collect step with that round's results. A task that's rejected, fails
 * or never finishes gets no result. Hitting the platform subrequest limit
 * stops posting and polling. Returns every collected result and whether the
 * limit was hit.
 */
export async function runQueuedTasks(
  step: WorkflowStep,
  ctx: CheckContext,
  tasks: RankCheckTaskInput[],
  label: string,
  onCollected?: (results: RankCheckResultWithDevice[]) => Promise<void>,
): Promise<{
  collected: RankCheckResultWithDevice[];
  subrequestLimited: boolean;
}> {
  // A failed post must not abort the run: earlier chunks were already
  // charged at DataForSEO, so their results have to be collected.
  let pending: PostedRankCheckTask[] = [];
  let subrequestLimited = false;
  for (
    let i = 0;
    i < tasks.length && !subrequestLimited;
    i += MAX_TASKS_PER_POST
  ) {
    const chunk = tasks.slice(i, i + MAX_TASKS_PER_POST);
    const postLabel = `${label}post-tasks-${Math.floor(i / MAX_TASKS_PER_POST)}`;
    try {
      pending.push(
        ...(await pgStep(
          step,
          postLabel,
          SINGLE_ATTEMPT_STEP_CONFIG,
          async () => {
            try {
              return await ctx.client.serp.rankCheckTaskPost({
                tasks: chunk,
                locationCode: ctx.locationCode,
                languageCode: ctx.languageCode,
                locationName: ctx.locationName,
                depth: ctx.serpDepth,
                targetDomain: ctx.domain,
              });
            } catch (error) {
              if (isSubrequestLimitError(error)) {
                await recordSubrequestLimit(ctx.runId);
              }
              throw error;
            }
          },
        )),
      );
    } catch (error) {
      console.warn(`[rank-check] ${ctx.runId} ${postLabel} failed:`, error);
      subrequestLimited = isSubrequestLimitError(error);
    }
  }
  const collected: RankCheckResultWithDevice[] = [];

  // A collect failure (past its retries) leaves that round's tasks pending for
  // the next round instead of failing the run. Chunks posted before a post hit
  // the subrequest limit are already paid for, so they are still polled.
  for (
    let round = 0;
    round < QUEUED_POLL_INTERVALS.length && pending.length > 0;
    round++
  ) {
    await step.sleep(`${label}wait-${round}`, QUEUED_POLL_INTERVALS[round]);

    // Cap task_gets per round so one collect step stays well inside the
    // per-invocation subrequest limit at the 1000-keyword config ceiling.
    const batch = pending.slice(0, TASK_GETS_PER_COLLECT);
    const overflow = pending.slice(TASK_GETS_PER_COLLECT);
    try {
      // Results come back as the step's output, so a replay sees them too.
      const outcome = await pgStep(
        step,
        `${label}collect-${round}`,
        COLLECT_STEP_CONFIG,
        async () => {
          const fetched = await fetchQueuedRound(ctx, batch);
          if (onCollected && fetched.completed.length > 0) {
            await onCollected(fetched.completed);
          }
          return fetched;
        },
      );
      collected.push(...outcome.completed);
      pending = [...outcome.stillPending, ...overflow];
      if (outcome.subrequestLimited) {
        subrequestLimited = true;
        break;
      }
    } catch (error) {
      console.warn(
        `[rank-check] ${ctx.runId} ${label}collect-${round} failed:`,
        error,
      );
    }
  }
  return { collected, subrequestLimited };
}

/**
 * Check every keyword/device pair through the task queue (scheduled runs),
 * writing snapshots as tasks complete. Billing happens at task_post. Pairs
 * left without a result are retried by retryRankChecks. Returns whether the
 * check hit the platform subrequest limit.
 */
export async function runQueuedCheck(
  step: WorkflowStep,
  ctx: CheckContext,
): Promise<boolean> {
  const { subrequestLimited } = await runQueuedTasks(
    step,
    ctx,
    expandToTaskInputs(ctx.keywords, ctx.devices),
    "",
    async (results) => {
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
  );
  return subrequestLimited;
}
