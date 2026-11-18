import { describeError } from "@/server/lib/errors";

/** Waits before the second and third create, so a short engine blip can pass. */
const RETRY_DELAYS_MS = [500, 2_000];

/**
 * `workflow.create` with the engine's passing failures absorbed. The engine
 * refuses a create now and then, during a network incident or on an internal
 * error, and the job would otherwise fail the moment it was asked for. A
 * refused create whose instance exists all the same went through and only
 * its reply was lost, so that instance counts as started rather than being
 * created twice. The last failure is thrown for the caller to roll back on.
 */
export async function startWorkflow<P>(
  workflow: Workflow<P>,
  options: WorkflowInstanceCreateOptions<P> & { id: string },
  label: string,
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await workflow.create(options);
      return;
    } catch (error) {
      console.warn(
        `[workflow] ${label} ${options.id} create attempt ${attempt + 1} failed: ${describeError(error)}`,
      );
      if (await instanceExists(workflow, options.id)) return;
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay === undefined) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/**
 * Only an instance still in flight counts: a finished one under the same id
 * (the research setup reuses its id) was not started by this call.
 */
async function instanceExists<P>(workflow: Workflow<P>, id: string) {
  const status = await readWorkflowStatus(workflow, id);
  return status !== null && status !== "missing" && isWorkflowActive(status);
}

export type WorkflowStatus = Awaited<ReturnType<WorkflowInstance["status"]>>;

/** Whether an instance with this status may still write to its run. */
export function isWorkflowActive({ status }: WorkflowStatus) {
  return ["queued", "running", "waiting", "waitingForPause", "paused"].includes(
    status,
  );
}

/**
 * An instance's status, "missing" when the engine says there is no such
 * instance, or null when the lookup itself failed. Reconcilers fail a run only
 * on a status or a confirmed miss: a passing control-plane error is not proof
 * the workflow stopped, and failing a live run frees its slot for a second,
 * paid run while the first one keeps going.
 */
export async function readWorkflowStatus<P>(
  workflow: Workflow<P>,
  id: string,
): Promise<WorkflowStatus | "missing" | null> {
  try {
    return await (await workflow.get(id)).status();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return /not[ _]?found/i.test(message) ? "missing" : null;
  }
}

/**
 * An AI visibility, rank or local rank check still active after this long is stuck:
 * the slowest that finished on hosted took under 6 hours. Its instance may
 * still report "running" (a frozen step on the Docker edition stays
 * "running" for good), so the run would otherwise block its tracker forever.
 */
export const STUCK_RUN_AFTER_MS = 12 * 60 * 60_000;

/**
 * Stops a stuck instance, so it can no longer post paid calls after its run is
 * failed. `get` throws for an unknown id and `terminate` for an instance that
 * already stopped; both leave nothing to stop.
 */
export async function terminateStuckWorkflow<P>(
  workflow: Workflow<P>,
  id: string,
) {
  try {
    await (await workflow.get(id)).terminate();
  } catch {
    // Already gone or stopped.
  }
}
