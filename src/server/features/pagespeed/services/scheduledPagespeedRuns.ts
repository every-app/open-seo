import { PagespeedUrlRepository } from "@/server/features/pagespeed/repositories/PagespeedUrlRepository";
import { customerHasPaidPlan } from "@/server/billing/subscription";
import { hasPagespeedApiKey } from "@/server/lib/pagespeedClient";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import type { PagespeedSweepParams } from "@/server/workflows/PagespeedSweepWorkflow";
import { computeNextPagespeedRunAt } from "@/shared/pagespeed";

/**
 * Just the slice of the workflow binding this cron uses. Taking the binding
 * rather than the whole `Env` mirrors `beginRankCheckRun`, and lets the sweep
 * be tested without fabricating an Env. Passing
 * `env.PAGESPEED_SWEEP_WORKFLOW` still type-errors if the payload drifts from
 * `PagespeedSweepParams`.
 */
type SweepWorkflowBinding = {
  create(options: { params: PagespeedSweepParams }): Promise<unknown>;
};

/**
 * Cron body for the `scheduled` Worker handler: start a PageSpeed sweep for
 * every project with URLs that are due. Wrapped in `withPgClient` at the
 * entrypoint (server.ts).
 *
 * The cron only dispatches — the slow PSI calls happen inside
 * PagespeedSweepWorkflow, so a tick stays short regardless of how many URLs
 * are due. Each URL's schedule is advanced *before* the workflow starts, so a
 * failure cannot leave it due and retrying on every subsequent tick.
 */
export async function runScheduledPagespeedRuns(
  workflow: SweepWorkflowBinding,
) {
  // No key means the feature is unconfigured; every run would 400. Bail before
  // touching the database so an unconfigured instance's cron stays silent.
  if (!(await hasPagespeedApiKey())) return;

  const now = new Date();
  const dueUrls = await PagespeedUrlRepository.listDueForSweep(
    now.toISOString(),
  );
  if (dueUrls.length === 0) return;

  const isHosted = await isHostedServerAuthMode();

  // One workflow instance per project rather than per URL: a project's URLs
  // share a quota and there is no reason to fan out further.
  const byProject = new Map<string, typeof dueUrls>();
  for (const url of dueUrls) {
    const bucket = byProject.get(url.projectId);
    if (bucket) bucket.push(url);
    else byProject.set(url.projectId, [url]);
  }

  for (const [projectId, urls] of byProject) {
    try {
      // PSI is free, but on hosted the quota belongs to the instance operator
      // and is shared across every tenant — so scheduled sweeps are a paid
      // feature there, matching scheduled rank checks.
      const organizationId = urls[0]?.organizationId;
      if (isHosted) {
        if (!organizationId) continue;
        if (!(await customerHasPaidPlan(organizationId))) continue;
      }

      // Advance every URL's schedule first. Doing this before dispatch means a
      // crashed workflow costs one missed day, not a retry storm.
      for (const url of urls) {
        await PagespeedUrlRepository.updateNextRunAt(
          url.id,
          computeNextPagespeedRunAt(now, url.nextRunAt),
        );
      }

      await workflow.create({
        params: { projectId, urlIds: urls.map((url) => url.id) },
      });
      console.log(
        `[cron] Started PageSpeed sweep for project ${projectId} (${urls.length} URL(s))`,
      );
    } catch (err) {
      console.error(
        `[cron] Error starting PageSpeed sweep for project ${projectId}:`,
        err,
      );
    }
  }
}
