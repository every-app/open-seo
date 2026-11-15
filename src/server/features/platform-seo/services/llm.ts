import { generateText, NoObjectGeneratedError, Output } from "ai";
import type { z } from "zod";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import {
  billResearchSpend,
  withResearchAdmission,
} from "@/server/billing/researchSpend";
import { requireOpenRouterCostUsd } from "@/server/lib/chatAgent";
import {
  buildChatAgentModel,
  requireOpenRouterAccess,
} from "@/server/lib/openrouter";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { AppError } from "@/server/lib/errors";

// Admits a whole step once (a hosted org needs credits; self-hosted runs
// freely), however many model calls the step makes inside it.
export function withStepAdmission<T>(
  customer: BillingCustomerContext,
  work: () => Promise<T>,
): Promise<T> {
  return withResearchAdmission(
    customer,
    "You need usage credits to run this step.",
    work,
  );
}

// One-shot structured generation for Platform SEO. Call it inside
// withStepAdmission; each call bills its actual OpenRouter cost.
export async function generateStructured<T extends z.ZodType>(params: {
  customer: BillingCustomerContext;
  operation: string;
  schema: T;
  system: string;
  prompt: string;
  maxOutputTokens: number;
  timeoutMs?: number;
}): Promise<z.infer<T>> {
  const result = await generateText({
    model: buildChatAgentModel(
      await requireOpenRouterAccess(),
      await getOptionalEnvValue("OPENROUTER_MODEL"),
      "low",
    ),
    output: Output.object({ schema: params.schema }),
    maxOutputTokens: params.maxOutputTokens,
    abortSignal: AbortSignal.timeout(params.timeoutMs ?? 120_000),
    system: params.system,
    prompt: params.prompt,
    onStepFinish: async (step) => {
      await billResearchSpend(params.customer, [
        {
          provider: "openrouter",
          creditFeature: "agent",
          operation: params.operation,
          costUsd: await requireOpenRouterCostUsd(step.providerMetadata),
        },
      ]);
    },
  }).catch((error: unknown) => {
    if (NoObjectGeneratedError.isInstance(error)) {
      throw new AppError(
        "INTERNAL_ERROR",
        "The model returned no usable result.",
      );
    }
    throw error;
  });
  return params.schema.parse(result.output);
}
