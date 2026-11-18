import { AiVisibilityRepository as repo } from "../repositories/AiVisibilityRepository";
import { AI_ANSWER_FAILURES } from "./aiVisibilityErrors";
import { failAiRun } from "./aiVisibilityRuns";

/**
 * Fails answers that never arrived (collectLateAiAnswers may still fill them
 * in) and records how the run finished.
 */
export async function finalizeAiRun(runId: string) {
  const run = await repo.getRunInternal(runId);
  if (!run || run.status !== "running") return;
  await repo.failPendingObservations(runId, AI_ANSWER_FAILURES.notArrived);
  await recordAiRunOutcome(runId);
}

/**
 * Records how the run finished from its answers, and tells the tracker when
 * answers went missing (settleAiRun charged none of them). A late answer
 * updates an older run, so only the project's latest run sets the notice.
 */
export async function recordAiRunOutcome(runId: string) {
  const run = await repo.getRunInternal(runId);
  if (!run) return;
  const rows = await repo.getObservationStatuses([runId]);
  const completed = rows.filter((row) => row.status === "completed").length;
  const missing = rows.some(
    (row) => row.error === AI_ANSWER_FAILURES.notArrived,
  );
  const status =
    completed === rows.length
      ? "completed"
      : completed > 0
        ? "partial"
        : "failed";
  await repo.updateRun(runId, {
    status,
    completedAt: run.completedAt ?? new Date().toISOString(),
  });
  const [latest] = await repo.listRuns(run.projectId, 1);
  if (latest?.id !== runId) return;
  await repo.updateTracker(run.trackerId, {
    lastSkipReason: missing
      ? AI_ANSWER_FAILURES.notCollected
      : status === "failed"
        ? AI_ANSWER_FAILURES.runFailed
        : null,
  });
}

/** The workflow's failure path: fail the run and say why on the tracker. */
export async function markAiRunFailed(runId: string) {
  const message = AI_ANSWER_FAILURES.runFailed;
  await failAiRun(runId, message);
  const run = await repo.getRunInternal(runId);
  if (run) await repo.updateTracker(run.trackerId, { lastSkipReason: message });
}
