import { createServerFn } from "@tanstack/react-start";
import { ActivationRepository } from "@/server/features/activation/repositories/ActivationRepository";
import { DashboardService } from "@/server/features/dashboard/services/DashboardService";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { dashboardProjectInputSchema } from "@/types/schemas/dashboard";

export const getDashboardActivation = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(dashboardProjectInputSchema)
  .handler(({ context }) =>
    DashboardService.getActivation({
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

// Visit-triggered: the client calls this when the overview reports a missing
// or stale backlink snapshot. Metered against org credits at most once per
// project per day (the service re-checks freshness server-side).
export const refreshDashboardBacklinkSnapshot = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .validator(dashboardProjectInputSchema)
  .handler(({ context }) =>
    DashboardService.ensureBacklinkSnapshot({
      projectId: context.projectId,
      domain: context.project.domain,
      billingCustomer: context,
    }),
  );

export const markDashboardCompetitorClicked = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .validator(dashboardProjectInputSchema)
  .handler(async ({ context }) => {
    await ActivationRepository.markCompetitorStepClicked(context.projectId);
    return { ok: true as const };
  });

// "I already connected" on the MCP card. Hides the card for this project;
// the org-level milestone stays untouched and self-corrects on the next
// real external tool call.
export const dismissDashboardMcpCard = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(dashboardProjectInputSchema)
  .handler(async ({ context }) => {
    await ActivationRepository.markMcpCardDismissed(context.projectId);
    return { ok: true as const };
  });
