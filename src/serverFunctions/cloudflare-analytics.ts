import { createServerFn } from "@tanstack/react-start";
import { waitUntil } from "cloudflare:workers";
import { z } from "zod";
import { requireOrgPermission } from "@/server/auth/org-gate";
import { CloudflareAnalyticsError } from "@/server/features/cloudflare-analytics/CloudflareAnalyticsError";
import { CloudflareAnalyticsService } from "@/server/features/cloudflare-analytics/CloudflareAnalyticsService";
import { AppError } from "@/server/lib/errors";
import { captureServerEvent } from "@/server/lib/posthog";
import { requireProjectContext } from "@/serverFunctions/middleware";

const projectSchema = z.object({ projectId: z.string().min(1) });
const connectSchema = projectSchema.extend({
  apiToken: z.string().trim().min(20).max(4_096),
  zoneId: z
    .string()
    .trim()
    .regex(/^[a-f0-9]{32}$/i, "Expected a 32-character Cloudflare zone ID"),
  zoneLabel: z.string().trim().min(1).max(255).optional(),
});

function translateConnectError(error: unknown): never {
  if (!(error instanceof CloudflareAnalyticsError)) throw error;
  if (error.code === "encryption_unavailable") {
    throw new AppError("AUTH_CONFIG_MISSING", error.message);
  }
  if (error.code === "rate_limited") throw new AppError("RATE_LIMITED");
  if (
    error.code === "authentication_failed" ||
    error.code === "zone_not_accessible" ||
    error.code === "dataset_unavailable" ||
    error.code === "invalid_response"
  ) {
    throw new AppError("VALIDATION_ERROR");
  }
  throw new AppError("UPSTREAM_UNAVAILABLE");
}

export const getCloudflareAnalyticsConnection = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .validator(projectSchema)
  .handler(({ context }) =>
    CloudflareAnalyticsService.getConnection(context.projectId),
  );

export const connectCloudflareAnalytics = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(connectSchema)
  .handler(async ({ data, context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    try {
      const result = await CloudflareAnalyticsService.connect({
        projectId: context.projectId,
        organizationId: context.organizationId,
        userId: context.userId,
        apiToken: data.apiToken,
        zoneId: data.zoneId,
        zoneLabel: data.zoneLabel,
      });
      waitUntil(
        captureServerEvent({
          distinctId: context.userId,
          event: "cloudflare-analytics:connect",
          organizationId: context.organizationId,
          properties: { project_id: context.projectId },
        }),
      );
      return result;
    } catch (error) {
      return translateConnectError(error);
    }
  });

export const disconnectCloudflareAnalytics = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectSchema)
  .handler(async ({ context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    await CloudflareAnalyticsService.disconnect(context.projectId);
    waitUntil(
      captureServerEvent({
        distinctId: context.userId,
        event: "cloudflare-analytics:disconnect",
        organizationId: context.organizationId,
        properties: { project_id: context.projectId },
      }),
    );
    return { connected: false as const };
  });
