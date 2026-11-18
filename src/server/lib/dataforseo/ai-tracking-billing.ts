import {
  getOrCreateOrganizationCustomer,
  reserveUsageCredits,
  settleUsageCredits,
  type BillingCustomerContext,
  type UsageCreditHold,
} from "@/server/billing/subscription";
import {
  postAiTrackingTasks,
  type PostedAiTrackingTask,
} from "@/server/lib/dataforseo/ai-tracking";
import { dataforseoPricing } from "@/server/lib/dataforseo/pricing";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { creditsForProviderUsd } from "@/shared/billing";

// Queued AI visibility answers are billed on arrival. DataForSEO charges at
// task_post, so the post holds credits on the metered client's seam and the
// workflow settles the hold once collection ends, charging only the answers
// that arrived.

/** A queued AI visibility post's credit hold, open until collection ends. */
export interface AiTrackingHold {
  hold: UsageCreditHold;
  path: string[];
}

/**
 * Autumn's longest lock, less a minute for clock skew: the run reads late
 * answers until shortly before it. A hold that expires first releases its
 * credits, so the run is not charged.
 */
export const AI_TRACKING_HOLD_TTL_MS = 24 * 60 * 60_000 - 60_000;

export async function postAiTrackingTasksOnHold(
  customer: BillingCustomerContext,
  input: Parameters<typeof postAiTrackingTasks>[0],
): Promise<{ tasks: PostedAiTrackingTask[]; hold: AiTrackingHold | null }> {
  if (!(await isHostedServerAuthMode())) {
    return { tasks: (await postAiTrackingTasks(input)).data, hold: null };
  }
  const billingCustomer = await getOrCreateOrganizationCustomer(customer);
  // One call gets one hold, or INSUFFICIENT_CREDITS.
  const {
    holds: [hold],
  } = await reserveUsageCredits({
    customer,
    customerId: billingCustomer.id,
    callCredits: [
      creditsForProviderUsd(dataforseoPricing.aiSearch.trackingTaskPost(input)),
    ],
    creditFeature: "ai_prompt_responses",
    ttlMs: AI_TRACKING_HOLD_TTL_MS,
  });
  try {
    const response = await postAiTrackingTasks(input);
    return {
      tasks: response.data,
      hold: { hold, path: response.billing.path },
    };
  } catch (error) {
    // No task came back, so no answer will arrive to pay for.
    await settleUsageCredits({ customer, hold, costs: [] });
    throw error;
  }
}

export function settleAiTrackingHold(
  customer: BillingCustomerContext,
  { hold, costs }: { hold: AiTrackingHold; costs: number[] },
) {
  // One summed charge rounds like the hold did; per-answer rounding would
  // overshoot it (100 answers: 154 held, 200 charged).
  const costUsd = costs.reduce((sum, cost) => sum + cost, 0);
  return settleUsageCredits({
    customer,
    hold: hold.hold,
    creditFeature: "ai_prompt_responses",
    costs: costs.length ? [{ costUsd, path: hold.path }] : [],
  });
}
