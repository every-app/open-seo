import { env } from "cloudflare:workers";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import type {
  RankCheckTriggerResult,
  RankTrackingConfig,
} from "@/types/schemas/rank-tracking";

type RunRow = Awaited<ReturnType<typeof RankTrackingRepository.getRunById>>;
type RunLockRow = Awaited<ReturnType<typeof RankTrackingRepository.getRunLock>>;

// Coordination invariants for rank checks:
// - `workflow id === run id`, so the workflow instance is the authoritative
//   runtime identity for a stored run.
// - `rank_check_locks` enforces at most one active runner per config.
// - Only the lock owner is allowed to spend credits, write snapshots, or
//   finalize the run.
// - Missing/unknown workflow state is tolerated briefly during startup before
//   we treat the run as stale and repair it.

type RankCheckWorkflowStatus = {
  status:
    | "queued"
    | "running"
    | "paused"
    | "errored"
    | "terminated"
    | "complete"
    | "waiting"
    | "waitingForPause"
    | "unknown";
  error?: {
    message: string;
  };
};

type RankCheckConfigForStart = Pick<
  RankTrackingConfig,
  "id" | "domain" | "locationCode" | "languageCode" | "devices" | "serpDepth"
>;

const ACTIVE_WORKFLOW_STATUSES = new Set<RankCheckWorkflowStatus["status"]>([
  "queued",
  "running",
  "waiting",
  "waitingForPause",
  "paused",
]);

const RANK_CHECK_STARTUP_GRACE_MS = 60 * 1000;

async function getRankCheckWorkflowStatus(
  runId: string,
): Promise<RankCheckWorkflowStatus | null> {
  try {
    const instance = await env.RANK_CHECK_WORKFLOW.get(runId);
    return (await instance.status()) as RankCheckWorkflowStatus;
  } catch {
    return null;
  }
}

function getStaleReason(
  workflowStatus: RankCheckWorkflowStatus | null,
  run: RunRow,
): string {
  if (run?.status === "completed" || run?.status === "failed") {
    return `Run already ${run.status}`;
  }
  if (!workflowStatus) {
    return "Workflow instance was not found";
  }
  if (
    workflowStatus.status === "errored" ||
    workflowStatus.status === "terminated"
  ) {
    return workflowStatus.error?.message ?? `Workflow ${workflowStatus.status}`;
  }
  if (workflowStatus.status === "complete") {
    return "Workflow completed without releasing the run lock";
  }
  return `Workflow is no longer active (${workflowStatus.status})`;
}

export async function beginRankCheckRun(input: {
  workflow: Env["RANK_CHECK_WORKFLOW"];
  config: RankCheckConfigForStart;
  projectId: string;
  billingCustomer: BillingCustomerContext;
  keywordsTotal: number;
  keywordIds?: string[];
  trigger: "manual" | "scheduled";
  workflowStartErrorMessage: string;
}): Promise<RankCheckTriggerResult> {
  const runId = crypto.randomUUID();
  const lockResult = await acquireRankCheckRunLock(input.config.id, runId);
  if (!lockResult.acquired) {
    return {
      ok: false,
      reason: "already_running",
      blockingRunId: lockResult.blockingRunId,
    };
  }

  try {
    await RankTrackingRepository.createRun({
      id: runId,
      configId: input.config.id,
      projectId: input.projectId,
      keywordsTotal: input.keywordsTotal,
      isSubsetRun: (input.keywordIds?.length ?? 0) > 0,
    });

    await input.workflow.create({
      id: runId,
      params: {
        runId,
        configId: input.config.id,
        billingCustomer: {
          userId: input.billingCustomer.userId,
          userEmail: input.billingCustomer.userEmail,
          organizationId: input.billingCustomer.organizationId,
          projectId: input.billingCustomer.projectId,
        },
        projectId: input.projectId,
        domain: input.config.domain,
        locationCode: input.config.locationCode,
        languageCode: input.config.languageCode,
        devices: input.config.devices,
        serpDepth: input.config.serpDepth,
        trigger: input.trigger,
        keywordIds: input.keywordIds,
      },
    });
  } catch (error) {
    try {
      await failRunAndReleaseRankCheckLock(
        input.config.id,
        runId,
        input.workflowStartErrorMessage,
      );
    } catch {
      await releaseRankCheckRunLock(input.config.id, runId);
    }

    try {
      const instance = await input.workflow.get(runId);
      await instance.terminate();
    } catch {
      // Workflow may not have been created
    }

    throw error;
  }

  return { ok: true, runId };
}

async function getStaleRankCheckRunReason(input: {
  run: RunRow;
  runId: string;
  ageMs: number;
}) {
  const workflowStatus = await getRankCheckWorkflowStatus(input.runId);

  if (workflowStatus && ACTIVE_WORKFLOW_STATUSES.has(workflowStatus.status)) {
    return null;
  }

  const startupWindow =
    input.ageMs < RANK_CHECK_STARTUP_GRACE_MS &&
    (!input.run ||
      input.run.status === "pending" ||
      input.run.status === "running") &&
    (!workflowStatus || workflowStatus.status === "unknown");

  if (startupWindow) {
    return null;
  }

  return getStaleReason(workflowStatus, input.run);
}

async function failRunIfNeeded(runId: string, reason: string, run: RunRow) {
  if (!run || run.status === "completed" || run.status === "failed") return;
  await RankTrackingRepository.updateRun(runId, {
    status: "failed",
    errorMessage: reason,
    completedAt: new Date().toISOString(),
  });
}

async function cleanupStaleLock(lock: NonNullable<RunLockRow>) {
  const run = await RankTrackingRepository.getRunById(lock.runId);
  if (run?.status === "completed" || run?.status === "failed") {
    await RankTrackingRepository.deleteRunLock(lock.configId, lock.runId);
    return true;
  }

  const staleReason = await getStaleRankCheckRunReason({
    runId: lock.runId,
    run,
    ageMs: Date.now() - new Date(lock.acquiredAt).getTime(),
  });
  if (!staleReason) return false;

  await failRunIfNeeded(lock.runId, staleReason, run);
  await RankTrackingRepository.deleteRunLock(lock.configId, lock.runId);
  return true;
}

export async function reconcileActiveRankCheckRun(run: NonNullable<RunRow>) {
  if (run.status !== "running" && run.status !== "pending") {
    return null;
  }

  const staleReason = await getStaleRankCheckRunReason({
    runId: run.id,
    run,
    ageMs: Date.now() - new Date(run.startedAt).getTime(),
  });
  if (!staleReason) return null;

  return {
    errorMessage: staleReason,
    completedAt: new Date().toISOString(),
  };
}

async function acquireRankCheckRunLock(configId: string, runId: string) {
  // Optimistic: try to grab the lock immediately
  if (await RankTrackingRepository.tryCreateRunLock(configId, runId)) {
    return { acquired: true as const };
  }

  // Lock exists — check if it's stale and can be cleaned up
  const existingLock = await RankTrackingRepository.getRunLock(configId);
  if (!existingLock) {
    // Lock was released between our insert and select — retry once
    if (await RankTrackingRepository.tryCreateRunLock(configId, runId)) {
      return { acquired: true as const };
    }
    const blocker = await RankTrackingRepository.getRunLock(configId);
    return { acquired: false as const, blockingRunId: blocker?.runId ?? null };
  }

  const cleaned = await cleanupStaleLock(existingLock);
  if (!cleaned) {
    return { acquired: false as const, blockingRunId: existingLock.runId };
  }

  // Stale lock cleaned — retry once
  if (await RankTrackingRepository.tryCreateRunLock(configId, runId)) {
    return { acquired: true as const };
  }

  const blocker = await RankTrackingRepository.getRunLock(configId);
  return { acquired: false as const, blockingRunId: blocker?.runId ?? null };
}

export async function runOwnsRankCheckLock(configId: string, runId: string) {
  const lock = await RankTrackingRepository.getRunLock(configId);
  return lock?.runId === runId;
}

export async function releaseRankCheckRunLock(configId: string, runId: string) {
  await RankTrackingRepository.deleteRunLock(configId, runId);
}

export async function failRunAndReleaseRankCheckLock(
  configId: string,
  runId: string,
  errorMessage: string,
) {
  const run = await RankTrackingRepository.getRunById(runId);
  await failRunIfNeeded(runId, errorMessage, run);
  await RankTrackingRepository.deleteRunLock(configId, runId);
}
