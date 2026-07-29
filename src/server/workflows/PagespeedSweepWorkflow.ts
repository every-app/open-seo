import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { withPgClient } from "@/db";
import { PagespeedService } from "@/server/features/pagespeed/services/PagespeedService";
import { pgStep } from "@/server/workflows/pgStep";

/**
 * One PSI call takes 10-30s and a project can have 10 monitored URLs, so the
 * sweep runs here rather than inline in the cron handler: each URL is its own
 * durable step, and a tick that dies part-way resumes instead of restarting.
 */
const URL_STEP_CONFIG = {
  // PagespeedService already stores a failed strategy as an error row, so a
  // retry would duplicate rows rather than recover anything.
  retries: { limit: 0, delay: "1 second" as const },
  // Two concurrent PSI calls, each capped at 60s client-side.
  timeout: "3 minutes" as const,
};

export interface PagespeedSweepParams {
  projectId: string;
  /** Resolved by the cron, which has already advanced each URL's schedule. */
  urlIds: string[];
}

export class PagespeedSweepWorkflow extends WorkflowEntrypoint<
  Env,
  PagespeedSweepParams
> {
  async run(event: WorkflowEvent<PagespeedSweepParams>, step: WorkflowStep) {
    return withPgClient(() => this.runScoped(event, step));
  }

  private async runScoped(
    event: WorkflowEvent<PagespeedSweepParams>,
    step: WorkflowStep,
  ) {
    const { projectId, urlIds } = event.payload;
    let succeeded = 0;
    let failed = 0;

    for (const urlId of urlIds) {
      // Per-URL try/catch: one unreachable page must not strand the rest of
      // the project's URLs for a whole day.
      try {
        await pgStep(step, `run-url-${urlId}`, URL_STEP_CONFIG, async () => {
          const snapshots = await PagespeedService.runForUrl({
            projectId,
            urlId,
            trigger: "scheduled",
          });
          return { count: snapshots.length };
        });
        succeeded += 1;
      } catch (error) {
        failed += 1;
        console.error(
          `[psi-sweep] project ${projectId} url ${urlId} failed:`,
          error,
        );
      }
    }

    return { projectId, succeeded, failed };
  }
}
