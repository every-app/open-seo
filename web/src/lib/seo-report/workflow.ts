import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { desk, type SeoReportEnv } from "./config";
import { ReportFailure } from "./failure";
import { REPORT_LIMITS } from "./limits";
import { isRemoved } from "./removed";
import { writeReport } from "./write";

// One report, start to finish: write it, then tell the desk how it ended,
// with the report or the reason there is none.
// The desk (desk.ts) stores the report, frees the slot and sends the emails.
// The Workflow's id is the run's id.
//
// It also takes one command for the team, which empties the line:
//   wrangler workflows trigger seo-report '{"emptyLine":true}'

export type ReportParams = { site: string } | { emptyLine: true };

export class SeoReportWorkflow extends WorkflowEntrypoint<
  SeoReportEnv,
  ReportParams
> {
  async run(event: WorkflowEvent<ReportParams>, step: WorkflowStep) {
    const line = desk(this.env);
    if ("emptyLine" in event.payload)
      return { emptied: await step.do("empty the line", () => line.empty()) };
    const { site } = event.payload;
    const run = event.instanceId;
    const outcome = await step
      .do(
        "write report",
        {
          // No retries, and the desk refuses a second start: Workflows can run
          // a step again after an engine restart, and this one spends money.
          retries: { limit: 0, delay: "1 second" },
          timeout: `${REPORT_LIMITS.runMinutes + 1} minutes`,
        },
        async () => {
          if (!(await line.beginWriting(run))) return ReportFailure.Failed;
          // The site may have been removed while its report waited in line.
          if (isRemoved(site)) return ReportFailure.Failed;
          return writeReport(this.env, site);
        },
      )
      .catch(() => ReportFailure.Failed);
    await step.do(
      "finish",
      { retries: { limit: 5, delay: "10 seconds", backoff: "exponential" } },
      () => line.finish(run, outcome),
    );
    return { written: typeof outcome !== "string" };
  }
}
