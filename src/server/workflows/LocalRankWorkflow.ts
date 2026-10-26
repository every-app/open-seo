import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import {
  failLocalPoints,
  finalizeLocalCheck,
  prepareLocalCheck,
  searchLocalPoints,
} from "@/server/features/local-seo/services/localSeoCollection";
import { pgStep } from "./pgStep";
import { describeError } from "@/server/lib/errors";

type LocalRankPayload = {
  checkId: string;
  customer: BillingCustomerContext;
};
const ONCE = {
  retries: { limit: 0, delay: "1 second" as const },
  timeout: "2 minutes" as const,
};
// A Worker keeps six outbound connections open at once, so one step's live
// searches run in a single wave (~3-5 s each).
const SEARCHES_PER_STEP = 6;

export class LocalRankWorkflow extends WorkflowEntrypoint<
  Env,
  LocalRankPayload
> {
  async run(event: WorkflowEvent<LocalRankPayload>, step: WorkflowStep) {
    const { checkId, customer } = event.payload;
    const projectId = customer.projectId;
    if (!projectId) return;
    try {
      const plans = await pgStep(step, "prepare", undefined, () =>
        prepareLocalCheck(projectId, checkId),
      );
      for (const plan of plans) {
        for (
          let offset = 0;
          offset < plan.points.length;
          offset += SEARCHES_PER_STEP
        ) {
          const points = plan.points.slice(offset, offset + SEARCHES_PER_STEP);
          try {
            // Paid searches run once; a failed step fails its points instead
            // of buying the same searches again.
            await pgStep(step, `search-${plan.scanId}-${offset}`, ONCE, () =>
              searchLocalPoints(plan, points, customer),
            );
          } catch (error) {
            console.error(
              `[local-seo] keyword ${plan.scanId} points ${offset}+ failed:`,
              error,
            );
            await pgStep(step, `fail-${plan.scanId}-${offset}`, undefined, () =>
              failLocalPoints(points),
            );
          }
        }
      }
      await pgStep(step, "complete", undefined, () =>
        finalizeLocalCheck(projectId, checkId),
      );
    } catch (error) {
      console.error(
        `[local-seo] check ${checkId} failed: ${describeError(error)}`,
        error,
      );
      await pgStep(step, "fail", undefined, () =>
        finalizeLocalCheck(
          projectId,
          checkId,
          "The check could not finish. Saved points remain available. Submitted searches may still use credits.",
        ),
      );
    }
  }
}
