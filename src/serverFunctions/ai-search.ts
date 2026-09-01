import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getBrandLookup } from "@/server/features/ai-search/services/brandLookup";
import {
  deleteBrandLookupRun,
  getBrandLookupRunPayload,
  listBrandLookupRuns,
  saveBrandLookupRun,
} from "@/server/features/ai-search/repositories/BrandLookupRunRepository";
import { explorePrompt as runExplorePrompt } from "@/server/features/ai-search/services/promptExplorer";
import { customerHasPaidPlan } from "@/server/billing/subscription";
import { AppError } from "@/server/lib/errors";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  brandLookupInputSchema,
  brandLookupResultSchema,
  promptExplorerInputSchema,
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
    const result = await getBrandLookup(
      { ...data, projectId: context.projectId },
      context,
    );

    // Save every lookup that came back with data. This is the only durable
    // record: the result cache expires after 24h and the old "recent searches"
    // list was localStorage, so a paid run was previously unrecoverable from
    // any other browser. A failed save must not fail the lookup the user just
    // paid for, so it is logged and swallowed.
    if (result.hasData) {
      try {
        await saveBrandLookupRun({
          projectId: context.projectId,
          query: data.query,
          competitors: data.competitors,
          result,
        });
      } catch (err) {
        console.error("ai-search.brand-lookup.save-run failed:", err);
      }
    }

    return result;
  });

export const explorePrompt = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(promptExplorerInputSchema)
  .handler(async ({ data, context }) => {
    await assertPaidPlan(context.organizationId);
    return runExplorePrompt({ ...data, projectId: context.projectId }, context);
  });

/**
 * Saved Brand Lookup runs for a project, newest first.
 *
 * projectId is required on every project-scoped server function: ensureUser
 * resolves (and authorizes) the project from `data.projectId`, so omitting it
 * fails the requireProjectContext middleware rather than defaulting to anything.
 */
export const listSavedBrandLookups = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ context }) => listBrandLookupRuns(context.projectId));

/**
 * Re-open a saved run from storage. Costs nothing: the stored payload is
 * returned instead of re-running the paid lookup.
 */
export const getSavedBrandLookup = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(
    z.object({ projectId: z.string().min(1), runId: z.string().min(1) }),
  )
  .handler(async ({ data, context }) => {
    const payload = await getBrandLookupRunPayload({
      projectId: context.projectId,
      runId: data.runId,
    });
    if (payload === null) return null;

    // A payload written by an older result shape must not be trusted blindly.
    const parsed = brandLookupResultSchema.safeParse(payload);
    return parsed.success ? parsed.data : null;
  });

export const removeSavedBrandLookup = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(
    z.object({ projectId: z.string().min(1), runId: z.string().min(1) }),
  )
  .handler(async ({ data, context }) => {
    await deleteBrandLookupRun({
      projectId: context.projectId,
      runId: data.runId,
    });
    return { ok: true };
  });
