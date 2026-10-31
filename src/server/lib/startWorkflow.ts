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
 * `get` throws for an unknown id. Only an instance still in flight counts: a
 * finished one under the same id (the research setup reuses its id) was not
 * started by this call.
 */
async function instanceExists<P>(workflow: Workflow<P>, id: string) {
  try {
    const { status } = await (await workflow.get(id)).status();
    return [
      "queued",
      "running",
      "waiting",
      "waitingForPause",
      "paused",
    ].includes(status);
  } catch {
    return false;
  }
}

/**
 * An AI visibility or rank check run still active after this long is stuck:
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
