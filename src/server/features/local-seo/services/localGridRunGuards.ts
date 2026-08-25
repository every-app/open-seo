import { env } from "cloudflare:workers";
import { LocalGridRunGuardRepository } from "../repositories/LocalGridRunGuardRepository";

type ActiveRun = {
  id: string;
  status: string;
  startedAt: string;
};

type LocalGridWorkflowStatus = {
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
  error?: { message: string };
};

type LocalGridRunReconciliation = "active" | "recovered" | "lost_race";

const ACTIVE_WORKFLOW_STATUSES = new Set<LocalGridWorkflowStatus["status"]>([
  "queued",
  "running",
  "waiting",
  "waitingForPause",
  "paused",
]);
const STARTUP_GRACE_MS = 60 * 1_000;

async function getWorkflowStatus(
  runId: string,
): Promise<LocalGridWorkflowStatus | null> {
  try {
    const instance = await env.LOCAL_GRID_WORKFLOW.get(runId);
    return (await instance.status()) as LocalGridWorkflowStatus;
  } catch {
    return null;
  }
}

function staleReason(run: ActiveRun, workflow: LocalGridWorkflowStatus | null) {
  if (workflow && ACTIVE_WORKFLOW_STATUSES.has(workflow.status)) return null;
  const ageMs = Date.now() - new Date(run.startedAt).getTime();
  if (
    ageMs < STARTUP_GRACE_MS &&
    (!workflow || workflow.status === "unknown")
  ) {
    return null;
  }
  if (!workflow) return "Workflow instance was not found";
  if (workflow.status === "errored" || workflow.status === "terminated") {
    return workflow.error?.message ?? `Workflow ${workflow.status}`;
  }
  if (workflow.status === "complete") {
    return "Workflow completed without finalizing the run";
  }
  return `Workflow is no longer active (${workflow.status})`;
}

export async function reconcilePendingLocalGridRun(
  run: ActiveRun,
): Promise<LocalGridRunReconciliation> {
  if (run.status !== "pending") return "active";
  const reason = staleReason(run, await getWorkflowStatus(run.id));
  if (!reason) return "active";
  const recovered = await LocalGridRunGuardRepository.failStalePendingRun({
    runId: run.id,
    startedAt: run.startedAt,
    reason,
  });
  return recovered ? "recovered" : "lost_race";
}
