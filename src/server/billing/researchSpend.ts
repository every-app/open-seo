import {
  checkUsageCreditsDepleted,
  getUsageCreditsRemaining,
  holdTaskCredits,
  releaseTaskCredits,
  trackUsageCreditSpend,
  type BillingCustomerContext,
} from "./subscription";
import { AppError } from "@/server/lib/errors";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import type { CreditFeature } from "@/shared/billing-credit-features";

export type ResearchSpend = {
  provider: "openrouter" | "dataforseo" | "context";
  creditFeature: CreditFeature;
  operation: string;
  costUsd: number;
};

/**
 * Runs paid research that any positive credit balance admits, holding some of
 * that balance until it finishes (see holdTaskCredits). Its provider calls
 * finish and bill even if the balance goes negative meanwhile. Self-hosted
 * research has no balance and runs ungated.
 */
export async function withResearchAdmission<T>(
  customer: BillingCustomerContext,
  refusal: string,
  work: () => Promise<T>,
): Promise<T> {
  if (!(await isHostedServerAuthMode())) return work();
  const gate = await checkUsageCreditsDepleted(customer);
  if (gate.depleted) throw new AppError("INSUFFICIENT_CREDITS", refusal);
  const hold = await holdTaskCredits(customer, gate);
  if (!hold) {
    throw new AppError(
      "INSUFFICIENT_CREDITS",
      "Your remaining credits are in use by other research that's still running. Try again when it finishes, or add credits.",
    );
  }
  try {
    return await work();
  } finally {
    await releaseTaskCredits(customer, hold);
  }
}

/** Settle admitted research after it finishes; depletion must never block it. */
export async function billResearchSpend(
  customer: BillingCustomerContext,
  spend: ResearchSpend[],
) {
  const charges = spend.filter(({ costUsd }) => costUsd > 0);
  if (!charges.length) return;
  try {
    if (!(await isHostedServerAuthMode())) return;
    // Read only to choose the credit pool, never to gate an admitted task.
    // Any excess goes negative on monthly credits, which every org has, rather
    // than disappearing against a top-up balance the user may never have bought.
    let { monthlyRemaining, topupRemaining } = await getUsageCreditsRemaining(
      customer.organizationId,
    );
    for (const { provider, creditFeature, operation, costUsd } of charges) {
      const { monthlyCredits, topupCredits } = await trackUsageCreditSpend({
        customer,
        customerId: customer.organizationId,
        creditFeature,
        costUsd,
        monthlyRemaining,
        overdraft: { topupRemaining },
        properties: { provider, operation },
      });
      monthlyRemaining -= monthlyCredits;
      topupRemaining -= topupCredits;
    }
  } catch (error) {
    // A metering failure must not discard completed research. Do not replay
    // an uncertain charge: Autumn track has no idempotency key.
    console.error("Research credit metering failed", {
      organizationId: customer.organizationId,
      projectId: customer.projectId,
      spend: charges,
      error,
    });
  }
}
