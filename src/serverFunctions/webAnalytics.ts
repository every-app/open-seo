import { createServerFn } from "@tanstack/react-start";
import { waitUntil } from "cloudflare:workers";
import { z } from "zod";
import { requireOrgPermission } from "@/server/auth/org-gate";
import { captureServerEvent } from "@/server/lib/posthog";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  webAnalyticsDimensionSchema,
  webAnalyticsPeriodSchema,
} from "@/types/schemas/web-analytics";
import { WebAnalyticsSiteService } from "@/server/features/web-analytics/services/WebAnalyticsSiteService";
import { WebAnalyticsStatsService } from "@/server/features/web-analytics/services/WebAnalyticsStatsService";

const projectScopedSchema = z.object({ projectId: z.string().min(1) });
const periodScopedSchema = projectScopedSchema.extend({
  period: webAnalyticsPeriodSchema,
});

export const getWebAnalyticsSite = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(({ context }) =>
    WebAnalyticsSiteService.getStatus(context.projectId),
  );

export const enableWebAnalytics = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    const status = await WebAnalyticsSiteService.enable({
      projectId: context.projectId,
      organizationId: context.organizationId,
      domain: context.project.domain,
    });
    waitUntil(
      captureServerEvent({
        distinctId: context.userId,
        event: "web_analytics:enable",
        organizationId: context.organizationId,
        properties: { project_id: context.projectId },
      }),
    );
    return status;
  });

export const disableWebAnalytics = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    const status = await WebAnalyticsSiteService.disable(context.projectId);
    waitUntil(
      captureServerEvent({
        distinctId: context.userId,
        event: "web_analytics:disable",
        organizationId: context.organizationId,
        properties: { project_id: context.projectId },
      }),
    );
    return status;
  });

export const getWebAnalyticsOverview = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(periodScopedSchema)
  .handler(({ data, context }) =>
    WebAnalyticsStatsService.getOverview(context.projectId, data.period),
  );

export const getWebAnalyticsBreakdown = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(
    periodScopedSchema.extend({ dimension: webAnalyticsDimensionSchema }),
  )
  .handler(({ data, context }) =>
    WebAnalyticsStatsService.getBreakdown(
      context.projectId,
      data.period,
      data.dimension,
    ),
  );
