import type { BillingCustomerContext } from "@/server/billing/subscription";
import {
  createDataforseoClient,
  type AiTrackingHold,
  type PostedAiTrackingTask,
} from "@/server/lib/dataforseo";
import { AiVisibilityRepository as repo } from "../repositories/AiVisibilityRepository";

/** A posted batch's credit hold and the tasks it pays for, if they arrive. */
export type AiPostedHold = AiTrackingHold & { tasks: PostedAiTrackingTask[] };

/**
 * Charges each posted batch for the answers it delivered and releases the
 * rest of its hold, so an answer DataForSEO never returned costs nothing. An
 * answer posted again arrived through its last task; the earlier ones failed.
 */
export async function settleAiRun(
  runId: string,
  customer: BillingCustomerContext,
  holds: AiPostedHold[],
) {
  const completed = new Set(
    (await repo.getObservations([runId]))
      .filter((row) => row.status === "completed")
      .map((row) => row.id),
  );
  const lastTask = new Map(
    holds.flatMap((hold) =>
      hold.tasks.map((task) => [task.tag, task.taskId] as const),
    ),
  );
  const dataforseo = createDataforseoClient(customer);
  for (const hold of holds) {
    const costs = hold.tasks
      .filter(
        (task) =>
          completed.has(task.tag) && lastTask.get(task.tag) === task.taskId,
      )
      .map((task) => task.costUsd);
    await dataforseo.aiSearch.settleTrackingHold({ hold, costs });
  }
}
