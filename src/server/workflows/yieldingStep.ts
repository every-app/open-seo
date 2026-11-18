import type { WorkflowStep, WorkflowStepConfig } from "cloudflare:workers";

/**
 * How long a workflow may run steps back to back before it pauses for a
 * second. This, plus the longest step timeout (10 minutes), plus replaying
 * the completed steps, must stay under the Docker image's
 * CELLD_HANDLER_BUDGET_S (deploy/standalone/Dockerfile). Every workflow's
 * run() wraps its step with yieldingStep.
 */
const YIELD_AFTER_MS = 2 * 60_000;

/**
 * The Docker edition's runtime, celld, runs a workflow's steps inside one
 * handler until the workflow waits, and stops that handler once it passes
 * CELLD_HANDLER_BUDGET_S. The instance then stays "running" without making
 * progress until the runtime restarts (denoland/celld#299). A short sleep
 * after a stretch of steps ends the handler, so the next step starts in a
 * fresh one. On Cloudflare the sleep is just a one-second pause.
 *
 * A replay skips steps that already completed in well under YIELD_AFTER_MS,
 * so it never calls the sleeps an earlier run made, and the sleep before a
 * step is named after that step, so a later run never reuses a completed one.
 */
export function yieldingStep(step: WorkflowStep): WorkflowStep {
  let since = Date.now();
  const pauseIfDue = async (name: string) => {
    if (Date.now() - since < YIELD_AFTER_MS) return;
    await step.sleep(`yield-before-${name}`, "1 second");
    since = Date.now();
  };
  async function stepDo<T extends Rpc.Serializable<T>>(
    name: string,
    configOrCallback: WorkflowStepConfig | (() => Promise<T>),
    callback?: () => Promise<T>,
  ): Promise<T> {
    await pauseIfDue(name);
    if (typeof configOrCallback === "function")
      return step.do(name, configOrCallback);
    if (!callback) throw new Error(`step ${name} has no callback`);
    return step.do(name, configOrCallback, callback);
  }
  return {
    do: stepDo,
    sleep: (name, duration) => step.sleep(name, duration),
    sleepUntil: (name, timestamp) => step.sleepUntil(name, timestamp),
    waitForEvent: (name, options) => step.waitForEvent(name, options),
  };
}
