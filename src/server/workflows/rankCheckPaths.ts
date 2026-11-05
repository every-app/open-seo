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
// task is free while re-posting it is billed again, so unfinished tasks are only
// left for the next read after that. Cumulative waits: 4 / 6 / 8 / 10 / 12 / 15 /
// 20 / 25 / 30 / 45 / 60 minutes.
const QUEUED_POLL_INTERVALS = [
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
 * dropped.
 */
async function fetchQueuedRound(
  ctx: CheckContext,
  tasks: PostedRankCheckTask[],
): Promise<{
  completed: RankCheckResultWithDevice[];
  stillPending: PostedRankCheckTask[];
}> {
  const completed: RankCheckResultWithDevice[] = [];
  const stillPending: PostedRankCheckTask[] = [];

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
 * step per 100, then poll task_get for up to an hour. `onCollected` runs inside
 * each collect step with that round's results. A task that's rejected, fails
 * or never finishes gets no result. Returns every collected result.
 */
export async function runQueuedTasks(
  step: WorkflowStep,
  ctx: CheckContext,
  tasks: RankCheckTaskInput[],
  label: string,
  onCollected?: (results: RankCheckResultWithDevice[]) => Promise<void>,
): Promise<RankCheckResultWithDevice[]> {
  // A failed post must not abort the run: earlier chunks were already
  // charged at DataForSEO, so their results have to be collected.
  let pending: PostedRankCheckTask[] = [];
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

  // A collect failure (past its retries) leaves that round's tasks pending for
  // the next round instead of failing the run.
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
    } catch (error) {
      console.warn(
        `[rank-check] ${ctx.runId} ${label}collect-${round} failed:`,
        error,
      );
    }
  }
  return collected;
}

/**
 * Read every keyword/device pair once through the task queue, writing snapshots
 * as tasks complete. Billing happens at task_post. Further reads are made by
 * retryRankChecks.
 */
export async function runQueuedCheck(
  step: WorkflowStep,
  ctx: CheckContext,
): Promise<void> {
  await runQueuedTasks(
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
}
