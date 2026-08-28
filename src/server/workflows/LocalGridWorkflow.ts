import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import { withPgClient } from "@/db";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { LocalGridRepository } from "@/server/features/local-seo/repositories/LocalGridRepository";
import {
  createDataforseoClient,
  fetchLocalGridTaskResult,
  MAX_TASKS_PER_POST,
  type PostedLocalGridTask,
} from "@/server/lib/dataforseo";
import { pgStep } from "@/server/workflows/pgStep";

const POST_STEP_CONFIG = {
  retries: { limit: 0, delay: "1 second" as const },
  timeout: "2 minutes" as const,
};
const COLLECT_STEP_CONFIG = {
  retries: { limit: 2, delay: "10 seconds" as const },
  timeout: "5 minutes" as const,
};
const RECORD_STEP_CONFIG = {
  retries: { limit: 2, delay: "2 seconds" as const },
  timeout: "2 minutes" as const,
};
const POLL_INTERVALS = [
  "4 minutes",
  "2 minutes",
  "2 minutes",
  "2 minutes",
  "2 minutes",
  "3 minutes",
] as const;
const COLLECT_BATCH_SIZE = 5;

interface LocalGridWorkflowParams {
  runId: string;
  configId: string;
  projectId: string;
  billingCustomer: BillingCustomerContext;
  languageCode: string;
  seDomain: string | null;
  searchDepth: number;
  searchPlaces: boolean;
  target: {
    placeId: string | null;
    cid: string | null;
    featureId: string | null;
  };
}

type PreparedGridScan = {
  languageCode: string;
  seDomain: string | null;
  searchDepth: number;
  searchPlaces: boolean;
  target: {
    placeId: string | null;
    cid: string | null;
    featureId: string | null;
  };
  tasks: Array<{
    resultId: string;
    pointId: string;
    keywordId: string;
    keyword: string;
    locationCoordinate: string;
  }>;
};

async function prepareScan(
  params: LocalGridWorkflowParams,
): Promise<PreparedGridScan> {
  const [run, details] = await Promise.all([
    LocalGridRepository.getRun(params.runId, params.projectId),
    LocalGridRepository.getConfig(params.configId, params.projectId),
  ]);
  if (!run || !details || !details.config.isActive) {
    throw new NonRetryableError("Map grid run or active configuration missing");
  }
  if (run.status === "failed" || run.status === "completed") {
    throw new NonRetryableError(`Map grid run is already ${run.status}`);
  }

  await LocalGridRepository.updateRun(params.runId, { status: "running" });
  const taskRows = await LocalGridRepository.getRunTaskInputs(params.runId);
  return {
    languageCode: params.languageCode,
    seDomain: params.seDomain,
    searchDepth: params.searchDepth,
    searchPlaces: params.searchPlaces,
    target: params.target,
    tasks: taskRows.map((task) => ({
      resultId: task.resultId,
      pointId: task.pointId,
      keywordId: task.keywordId,
      keyword: task.keyword,
      locationCoordinate: `${task.latitude.toFixed(7)},${task.longitude.toFixed(7)},14z`,
    })),
  };
}

async function collectTask(
  task: PostedLocalGridTask,
  target: PreparedGridScan["target"],
) {
  let outcome: Awaited<ReturnType<typeof fetchLocalGridTaskResult>>;
  try {
    outcome = await fetchLocalGridTaskResult({ ...task, target });
  } catch {
    return true;
  }
  if (outcome.status === "pending") return true;
  if (outcome.status === "failed") {
    await LocalGridRepository.markResultFailed(task.resultId, outcome.message);
  } else {
    await LocalGridRepository.recordCompletedTask(outcome.result);
  }
  return false;
}

async function collectBatch(
  tasks: PostedLocalGridTask[],
  target: PreparedGridScan["target"],
) {
  const statuses = await Promise.all(
    tasks.map((task) => collectTask(task, target)),
  );
  return tasks.filter((_, index) => statuses[index]);
}

async function updateRunProgress(runId: string) {
  const progress = await LocalGridRepository.getRunProgress(runId);
  await LocalGridRepository.updateRun(runId, {
    tasksCompleted: progress.completed + progress.failed,
    providerCostUsd: progress.providerCostUsd,
  });
}

async function finalizeRun(runId: string) {
  const progress = await LocalGridRepository.getRunProgress(runId);
  const tasksCompleted = progress.completed + progress.failed;
  const status = progress.completed > 0 ? "completed" : "failed";
  await LocalGridRepository.updateRun(runId, {
    status,
    tasksCompleted,
    providerCostUsd: progress.providerCostUsd,
    completedAt: new Date().toISOString(),
    errorMessage:
      progress.failed > 0
        ? `${progress.failed} map grid task(s) failed or timed out`
        : null,
  });
}

export class LocalGridWorkflow extends WorkflowEntrypoint<
  Env,
  LocalGridWorkflowParams
> {
  async run(event: WorkflowEvent<LocalGridWorkflowParams>, step: WorkflowStep) {
    return withPgClient(() => this.runScoped(event, step));
  }

  private async runScoped(
    event: WorkflowEvent<LocalGridWorkflowParams>,
    step: WorkflowStep,
  ) {
    const params = event.payload;
    try {
      const prepared = await pgStep(step, "prepare", POST_STEP_CONFIG, () =>
        prepareScan(params),
      );
      const client = createDataforseoClient(params.billingCustomer);
      const posted: PostedLocalGridTask[] = [];

      for (
        let offset = 0;
        offset < prepared.tasks.length;
        offset += MAX_TASKS_PER_POST
      ) {
        const batch = prepared.tasks.slice(offset, offset + MAX_TASKS_PER_POST);
        const batchIndex = Math.floor(offset / MAX_TASKS_PER_POST);
        const accepted = await pgStep(
          step,
          `post-${batchIndex}`,
          POST_STEP_CONFIG,
          () =>
            client.serp.localGridTaskPost({
              tasks: batch,
              languageCode: prepared.languageCode,
              seDomain: prepared.seDomain,
              depth: prepared.searchDepth,
              searchPlaces: prepared.searchPlaces,
            }),
        );
        await pgStep(
          step,
          `record-post-${batchIndex}`,
          RECORD_STEP_CONFIG,
          async () => {
            await LocalGridRepository.recordPostedTasks(accepted);
            const acceptedIds = new Set(accepted.map((task) => task.resultId));
            for (const rejected of batch) {
              if (!acceptedIds.has(rejected.resultId)) {
                await LocalGridRepository.markResultFailed(
                  rejected.resultId,
                  "Provider rejected the queued task",
                );
              }
            }
          },
        );
        posted.push(...accepted);
      }

      let pending = posted;
      for (
        let round = 0;
        round < POLL_INTERVALS.length && pending.length > 0;
        round += 1
      ) {
        await step.sleep(`poll-wait-${round}`, POLL_INTERVALS[round]);
        const nextPending: PostedLocalGridTask[] = [];
        for (
          let offset = 0;
          offset < pending.length;
          offset += COLLECT_BATCH_SIZE
        ) {
          const batch = pending.slice(offset, offset + COLLECT_BATCH_SIZE);
          const batchIndex = Math.floor(offset / COLLECT_BATCH_SIZE);
          const batchPending = await pgStep(
            step,
            `collect-${round}-${batchIndex}`,
            COLLECT_STEP_CONFIG,
            () => collectBatch(batch, prepared.target),
          );
          nextPending.push(...batchPending);
        }
        pending = nextPending;
        await pgStep(step, `record-progress-${round}`, RECORD_STEP_CONFIG, () =>
          updateRunProgress(params.runId),
        );
      }

      for (
        let offset = 0;
        offset < pending.length;
        offset += COLLECT_BATCH_SIZE
      ) {
        const batch = pending.slice(offset, offset + COLLECT_BATCH_SIZE);
        const batchIndex = Math.floor(offset / COLLECT_BATCH_SIZE);
        await pgStep(step, `mark-timeout-${batchIndex}`, POST_STEP_CONFIG, () =>
          Promise.all(
            batch.map((task) =>
              LocalGridRepository.markResultFailed(
                task.resultId,
                "Provider task timed out after 15 minutes",
              ),
            ),
          ).then(() => undefined),
        );
      }
      await pgStep(step, "finalize", POST_STEP_CONFIG, () =>
        finalizeRun(params.runId),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await LocalGridRepository.updateRun(params.runId, {
        status: "failed",
        errorMessage: message.slice(0, 1_000),
        completedAt: new Date().toISOString(),
      });
      throw error;
    }
  }
}
