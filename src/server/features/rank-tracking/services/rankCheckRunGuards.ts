import { env } from "cloudflare:workers";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import type {
  RankCheckTriggerResult,
  RankTrackingConfig,
} from "@/types/schemas/rank-tracking";
import {
  isWorkflowActive,
  readWorkflowStatus,
  startWorkflow,
  STUCK_RUN_AFTER_MS,
  terminateStuckWorkflow,
  type WorkflowStatus,
} from "@/server/lib/startWorkflow";

type RunRow = Awaited<ReturnType<typeof RankTrackingRepository.getRunById>>;

// Coordination model:
// - workflow id === run id (workflow instance is the authoritative runtime).
// - A partial unique index on rank_check_runs(config_id) WHERE status IN
//   ('pending','running') enforces at most one active run per config at the
//   DB level. A failed INSERT *is* the "already running" signal — no
//   separate lock table is needed.
// - Flipping status to 'completed'/'failed' is what frees the slot.
// - Missing/unknown workflow state is tolerated briefly during startup
//   before we treat a run as stale and mark it failed.
// - A run still active after STUCK_RUN_AFTER_MS is stuck: the next start
//   terminates its workflow and fails it. Reads only report it.

type RankCheckConfigForStart = Pick<
  RankTrackingConfig,
  | "id"
  | "domain"
  | "locationCode"
  | "languageCode"
  | "locationName"
  | "devices"
  | "serpDepth"
>;

const RANK_CHECK_STARTUP_GRACE_MS = 60 * 1000;

function getStaleReason(
  workflowStatus: WorkflowStatus | null,
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
    return "Workflow completed without finalizing the run";
  }
  return `Workflow is no longer active (${workflowStatus.status})`;
}

async function getStaleRankCheckRunReason(input: {
  run: RunRow;
  runId: string;
  ageMs: number;
}) {
  const workflowStatus = await readWorkflowStatus(
    env.RANK_CHECK_WORKFLOW,
    input.runId,
  );

  // A failed lookup says nothing about the workflow: treat it as still active.
  if (
    workflowStatus === null ||
    (workflowStatus !== "missing" && isWorkflowActive(workflowStatus))
  ) {
    if (input.ageMs < STUCK_RUN_AFTER_MS) return null;
    return `Workflow did not finish within ${STUCK_RUN_AFTER_MS / 3_600_000} hours`;
  }

  const startupWindow =
    input.ageMs < RANK_CHECK_STARTUP_GRACE_MS &&
    (!input.run ||
      input.run.status === "pending" ||
      input.run.status === "running") &&
    (workflowStatus === "missing" || workflowStatus.status === "unknown");

  if (startupWindow) {
    return null;
  }

  return getStaleReason(
    workflowStatus === "missing" ? null : workflowStatus,
    input.run,
  );
}

/**
 * Mark a run as failed if it's still in an active state. Idempotent — safe to
 * call on runs that are already completed/failed (updateRun skips them).
 */
export async function failRunIfActive(runId: string, reason: string) {
  await RankTrackingRepository.updateRun(runId, {
    status: "failed",
    errorMessage: reason,
    completedAt: new Date().toISOString(),
  });
}

export async function beginRankCheckRun(input: {
  workflow: Env["RANK_CHECK_WORKFLOW"];
  config: RankCheckConfigForStart;
  projectId: string;
  billingCustomer: BillingCustomerContext;
  keywordsTotal: number;
  keywordIds?: string[];
  maxCostCredits?: number;
  trigger: "manual" | "scheduled";
  workflowStartErrorMessage: string;
}): Promise<RankCheckTriggerResult> {
  // At most two attempts: once normally, once after clearing a stale blocker.
  for (let attempt = 0; attempt < 2; attempt++) {
    const runId = crypto.randomUUID();
    const created = await RankTrackingRepository.tryCreateRun({
      id: runId,
      configId: input.config.id,
      projectId: input.projectId,
      keywordsTotal: input.keywordsTotal,
      isSubsetRun: (input.keywordIds?.length ?? 0) > 0,
    });

    if (created) {
      try {
        await startWorkflow(
          input.workflow,
          {
            id: runId,
            params: {
              runId,
              configId: input.config.id,
              billingCustomer: input.billingCustomer,
              projectId: input.projectId,
              domain: input.config.domain,
              locationCode: input.config.locationCode,
              languageCode: input.config.languageCode,
              locationName: input.config.locationName ?? undefined,
              devices: input.config.devices,
              serpDepth: input.config.serpDepth,
              trigger: input.trigger,
              keywordIds: input.keywordIds,
              maxCostCredits: input.maxCostCredits,
            },
          },
          "rank check",
        );
      } catch (error) {
        // Workflow couldn't start — flip the run to failed so the
        // partial-index slot is released. Best-effort cleanup of any
        // zombie instance.
        await failRunIfActive(runId, input.workflowStartErrorMessage);
        await terminateStuckWorkflow(input.workflow, runId);
        throw error;
      }
      return { ok: true, runId };
    }

    // INSERT was blocked by the partial unique index — another active run
    // exists. Inspect it to decide whether to retry or return already_running.
    const blocker = await RankTrackingRepository.getActiveRunForConfig(
      input.config.id,
    );
    if (!blocker) {
      // Raced: blocker's status flipped between insert and select. Loop.
      continue;
    }

    if (attempt === 0) {
      const staleReason = await getStaleRankCheckRunReason({
        run: blocker,
        runId: blocker.id,
        ageMs: Date.now() - new Date(blocker.startedAt).getTime(),
      });
      if (staleReason) {
        // A stuck instance may still be running: stop it before freeing the
        // slot, so it can no longer post paid calls.
        await terminateStuckWorkflow(input.workflow, blocker.id);
        await failRunIfActive(blocker.id, staleReason);
        continue; // slot is free now — retry insert
      }
    }

    return { ok: false, reason: "already_running", blockingRunId: blocker.id };
  }

  // Exhausted attempts (rapid churn). Report whatever's blocking now.
  const final = await RankTrackingRepository.getActiveRunForConfig(
    input.config.id,
  );
  return {
    ok: false,
    reason: "already_running",
    blockingRunId: final?.id ?? null,
  };
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
