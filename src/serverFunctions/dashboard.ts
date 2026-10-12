import { DashboardSiteService } from "@/server/features/dashboard/services/DashboardSiteService";
import { AppError } from "@/server/lib/errors";
import { createServerFn } from "@tanstack/react-start";
import { ActivationRepository } from "@/server/features/activation/repositories/ActivationRepository";
import { DashboardService } from "@/server/features/dashboard/services/DashboardService";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  dashboardProjectInputSchema,
  dashboardBacklinksInputSchema,
  dashboardStepClickSchema,
  dashboardStepDismissalSchema,
} from "@/types/schemas/dashboard";

export const getDashboardActivation = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(dashboardProjectInputSchema)
  .handler(({ context }) =>
    DashboardService.getActivation({
      userId: context.userId,
      projectId: context.projectId,
      organizationId: context.organizationId,
      domain: context.project.domain,
    }),
  );

export const getDashboardOverview = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(dashboardProjectInputSchema)
  .handler(({ context }) =>
    DashboardService.getOverview({
      projectId: context.projectId,
      domain: context.project.domain,
    }),
  );

export const markDashboardStepClicked = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(dashboardStepClickSchema)
  .handler(async ({ context, data }) => {
    await ActivationRepository.markStepClicked(context.projectId, data.step);
    return { ok: true as const };
  });

// Hides only the optional GA4 pitch on this project's dashboard. The
// integration remains available in Project Settings and a later connection
// makes the dashboard card visible again.
export const dismissDashboardGa4Card = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(dashboardProjectInputSchema)
  .handler(async ({ context }) => {
    await ActivationRepository.markGa4CardDismissed(context.projectId);
    return { ok: true as const };
  });

export const setDashboardStepDismissed = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(dashboardStepDismissalSchema)
  .handler(async ({ context, data }) => {
    await DashboardService.setStepDismissed(
      context.userId,
      context.projectId,
      data.step,
      data.dismissed,
    );
    return { ok: true };
  });

export const getDashboardKeywords = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(dashboardProjectInputSchema)
  .handler(({ context }) =>
    DashboardSiteService.getKeywords(context.projectId, context.organizationId),
  );
export const getDashboardBacklinks = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(dashboardBacklinksInputSchema)
  .handler(({ context, data }) => {
    if (!context.project.domain)
      throw new AppError(
        "VALIDATION_ERROR",
        "Add your website in project settings first.",
      );
    return DashboardSiteService.getBacklinks(
      { domain: context.project.domain, kind: data.kind },
      context,
    );
  });
export const getDashboardEmergingQueries = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(dashboardProjectInputSchema)
  .handler(({ context }) =>
    DashboardSiteService.getEmergingQueries(
      context.projectId,
      context.organizationId,
    ),
  );
export const getDashboardLinkActivity = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(dashboardProjectInputSchema)
  .handler(({ context }) => {
    if (!context.project.domain)
      throw new AppError("VALIDATION_ERROR", "Add your website first.");
    return DashboardSiteService.getLinkActivity(
      context.project.domain,
      context,
    );
  });
