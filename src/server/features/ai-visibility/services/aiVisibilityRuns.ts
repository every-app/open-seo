import { env } from "cloudflare:workers";
import {
  AiVisibilityRepository as repo,
  type ConfigurationRows,
  type RunRow,
} from "../repositories/AiVisibilityRepository";
import { AiVisibilityError } from "./aiVisibilityErrors";
import { aiScope } from "./aiVisibilityConfiguration";
import {
  getOptionalEnvValue,
  isHostedServerAuthMode,
} from "@/server/lib/runtime-env";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import type { AiRun } from "@/shared/ai-visibility";
import type { RunAiCheckInput } from "@/types/schemas/ai-visibility";
import { requireConfiguration } from "./aiVisibilityMutation";
import { aiPromptIsBranded } from "./aiVisibilityMatching";
import { aiRunView } from "./aiVisibilityResults";
import { aiCostForAnswers } from "./aiVisibilityCost";

const ACTIVE_WORKFLOW_STATUSES = new Set([
  "queued",
  "running",
  "waiting",
  "waitingForPause",
  "paused",
]);
const STARTUP_GRACE_MS = 60_000;

/**
 * Why an active run's workflow is no longer collecting it, or null while it
 * is. The workflow instance id is the run id, like rank checks.
 */
async function staleRunReason(run: RunRow): Promise<string | null> {
  if (run.status !== "queued" && run.status !== "running") return null;
  const status = await env.AI_VISIBILITY_WORKFLOW.get(run.id)
    .then((instance) => instance.status())
    .catch(() => null);
  if (status && ACTIVE_WORKFLOW_STATUSES.has(status.status)) return null;
  if (Date.now() - Date.parse(run.createdAt) < STARTUP_GRACE_MS) return null;
  return status
    ? `Collection stopped (${status.status}).`
    : "Collection stopped before it started.";
}

/** Fails a run and its unfinished answers. Safe on a finished run. */
export async function failAiRun(runId: string, error: string) {
  const run = await repo.getRunInternal(runId);
  if (!run || (run.status !== "queued" && run.status !== "running")) return;
  await repo.failPendingObservations(runId, error);
  await repo.updateRun(runId, {
    status: "failed",
    completedAt: new Date().toISOString(),
  });
}

/** Fails an active run whose workflow has stopped, so it never blocks the tracker. */
export async function reconcileAiRun(run: RunRow): Promise<RunRow> {
  const reason = await staleRunReason(run);
  if (!reason) return run;
  await failAiRun(run.id, reason);
  return (await repo.getRunInternal(run.id)) ?? run;
}

export async function startRun(
  config: ConfigurationRows,
  trigger: RunRow["trigger"],
  billing: BillingCustomerContext,
  promptIds?: string[],
): Promise<AiRun> {
  if (!(await getOptionalEnvValue("DATAFORSEO_API_KEY")))
    throw new AiVisibilityError(
      "PROVIDER_NOT_CONFIGURED",
      "An operator must configure DATAFORSEO_API_KEY before collection. Your saved tracker remains available.",
    );
  const project = await repo.getProject(config.tracker.projectId);
  if (
    !project?.domain ||
    project.archivedAt ||
    project.organizationId !== billing.organizationId
  )
    throw new AiVisibilityError(
      "PROJECT_NOT_FOUND",
      "The selected project is not available for collection.",
    );
  const scope = aiScope(config, promptIds);
  if (!scope.prompts.length || !scope.engines.length)
    throw new AiVisibilityError(
      "NO_ACTIVE_PROMPTS",
      "Add or unpause prompts before starting a check.",
    );
  const own = { name: project.name, domain: project.domain };
  // Two attempts: once normally, once after failing a stale blocker.
  for (let attempt = 0; attempt < 2; attempt++) {
    const id = crypto.randomUUID();
    try {
      await repo.createRun(
        {
          id,
          trackerId: config.tracker.id,
          projectId: project.id,
          trigger,
          locationCode: config.tracker.locationCode,
          languageCode: config.tracker.languageCode,
          createdAt: new Date().toISOString(),
        },
        scope.prompts.flatMap((prompt) =>
          scope.engines.map((engine) => ({
            id: crypto.randomUUID(),
            runId: id,
            promptId: prompt.id,
            engine,
            branded: aiPromptIsBranded(prompt.text, own),
          })),
        ),
      );
    } catch (error) {
      // The one-active-run index rejected the insert, or it truly failed.
      const blocker = await repo.getActiveRun(config.tracker.id);
      if (!blocker) throw error;
      if (attempt === 0 && (await staleRunReason(blocker))) {
        await reconcileAiRun(blocker);
        continue;
      }
      throw new AiVisibilityError(
        "RUN_IN_PROGRESS",
        "A check is already collecting answers. Read that run instead of starting another; this check was not started or charged.",
        blocker.id,
      );
    }
    try {
      await env.AI_VISIBILITY_WORKFLOW.create({
        id,
        // Only the billing fields: the request context is not serializable.
        params: {
          runId: id,
          customer: {
            organizationId: billing.organizationId,
            userId: billing.userId,
            userEmail: billing.userEmail,
            projectId: project.id,
          },
        },
      });
    } catch (error) {
      await failAiRun(id, "Collection could not start.");
      throw error;
    }
    return getRun({ projectId: project.id, runId: id });
  }
  throw new AiVisibilityError(
    "RUN_IN_PROGRESS",
    "A check is already collecting answers. Try again shortly.",
  );
}

export async function runCheck(
  input: RunAiCheckInput,
  billing: BillingCustomerContext,
): Promise<AiRun> {
  const config = await requireConfiguration(input.projectId);
  const scope = aiScope(config, input.promptIds);
  // Price the check now and refuse it above what the user approved.
  const { costUsd } = aiCostForAnswers(
    scope.prompts.flatMap(() => scope.engines),
    await isHostedServerAuthMode(),
    "live",
  );
  if (Math.round(costUsd * 1e6) > Math.round(input.maxCostUsd * 1e6))
    throw new AiVisibilityError(
      "COST_LIMIT_EXCEEDED",
      `This check now costs $${costUsd.toFixed(4)}, more than the approved maximum. Review the new estimate before running it.`,
    );
  return startRun(config, "manual", billing, input.promptIds);
}

export async function getRun(input: {
  projectId: string;
  runId: string;
}): Promise<AiRun> {
  const found = await repo.getRun(input.projectId, input.runId);
  if (!found)
    throw new AiVisibilityError(
      "RUN_NOT_FOUND",
      "This run is not available in the selected project.",
    );
  const run = await reconcileAiRun(found);
  return aiRunView(run, await repo.getObservationStatuses([run.id]));
}
