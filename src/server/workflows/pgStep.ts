import type { WorkflowStep, WorkflowStepConfig } from "cloudflare:workers";
import { withPgClient } from "@/db";
import { carryOrganization } from "@/server/lib/gateway-attribution";

/**
 * `step.do` with a request-scoped Postgres client active inside the step body.
 *
 * Cloudflare Workflows invoke each step callback in its own execution context —
 * steps are independently persisted and can resume in a fresh invocation, so the
 * `AsyncLocalStorage` scope opened by `withPgClient` around `run()` does NOT
 * propagate into a step. Each DB-touching step must therefore open its own
 * client. In D1 mode `withPgClient` is a no-op, so this is just a plain
 * `step.do`. The organization a Workflow names around `run()` (for its calls
 * through an Every App gateway) is carried into the step the same way. The client is lazy (postgres-js only connects on first query), so
 * wrapping a step that happens not to touch the DB costs nothing.
 *
 * `T` mirrors `step.do`'s own `Rpc.Serializable<T>` bound so step results stay
 * serializable (the workflow engine persists and replays them). Pass `undefined`
 * for `config` to use the engine's default step config (matches the 2-arg
 * `step.do(name, fn)` form).
 */
export function pgStep<T extends Rpc.Serializable<T>>(
  step: WorkflowStep,
  name: string,
  config: WorkflowStepConfig | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  // The step doesn't inherit the organization the Workflow named around
  // run() either, which its calls through an Every App gateway are for.
  const body = carryOrganization(fn);
  return config
    ? step.do(name, config, () => withPgClient(body))
    : step.do(name, () => withPgClient(body));
}
