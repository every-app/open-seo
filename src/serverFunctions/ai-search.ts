import { createServerFn } from "@tanstack/react-start";
import { getBrandLookup } from "@/server/features/ai-search/services/brandLookup";
import { explorePrompt as runExplorePrompt } from "@/server/features/ai-search/services/promptExplorer";
import { AiModelSettingsService } from "@/server/features/ai-search/services/aiModelSettings";
import { customerHasPaidPlan } from "@/server/billing/subscription";
import { AppError } from "@/server/lib/errors";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  brandLookupInputSchema,
  getAiModelSettingsSchema,
  promptExplorerInputSchema,
  updateAiModelSettingsSchema,
} from "@/types/schemas/ai-search";

/**
 * AI Visibility endpoints are gated behind the paid plan in hosted mode
 * because each call fans out to several paid DataForSEO requests. Self-hosted
 * deployments pay DataForSEO directly and aren't gated.
 */
async function assertPaidPlan(organizationId: string) {
  if (!(await isHostedServerAuthMode())) return;
  if (await customerHasPaidPlan(organizationId)) return;
  throw new AppError(
    "PAYMENT_REQUIRED",
    "Upgrade to the paid plan to use AI Visibility",
  );
}

export const lookupBrand = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(brandLookupInputSchema)
  .handler(async ({ data, context }) => {
    await assertPaidPlan(context.organizationId);
    return getBrandLookup({ ...data, projectId: context.projectId }, context);
  });

export const explorePrompt = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(promptExplorerInputSchema)
  .handler(async ({ data, context }) => {
    await assertPaidPlan(context.organizationId);
    return runExplorePrompt({ ...data, projectId: context.projectId }, context);
  });

// Model settings are configuration, not paid data fetches, so they aren't
// behind the paid-plan gate.
export const getAiModelSettings = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getAiModelSettingsSchema)
  .handler(async ({ context }) =>
    AiModelSettingsService.getSettings(context.projectId),
  );

export const updateAiModelSettings = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(updateAiModelSettingsSchema)
  .handler(async ({ data, context }) => {
    await AiModelSettingsService.updateSettings(
      context.projectId,
      data.modelVersions,
    );
    return AiModelSettingsService.getSettings(context.projectId);
  });
