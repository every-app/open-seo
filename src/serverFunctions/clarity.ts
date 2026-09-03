import { createServerFn } from "@tanstack/react-start";
import { waitUntil } from "cloudflare:workers";
import { z } from "zod";
import { requireOrgPermission } from "@/server/auth/org-gate";
import { ClarityService } from "@/server/features/clarity/services/ClarityService";
import { captureServerEvent } from "@/server/lib/posthog";
import { AppError } from "@/server/lib/errors";
import { ClarityReportError } from "@/server/lib/clarityErrors";
import { requireProjectContext } from "@/serverFunctions/middleware";

const projectScopedSchema = z.object({ projectId: z.string().min(1) });
const connectClaritySchema = projectScopedSchema.extend({
  apiToken: z.string().trim().min(20).max(4_096),
});
export const CLARITY_INSIGHTS_PAGE_SIZES = [10, 25, 50] as const;
const clarityInsightsSchema = projectScopedSchema.extend({
  numOfDays: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  page: z.number().int().min(1).max(100),
  pageSize: z.union([
    z.literal(CLARITY_INSIGHTS_PAGE_SIZES[0]),
    z.literal(CLARITY_INSIGHTS_PAGE_SIZES[1]),
    z.literal(CLARITY_INSIGHTS_PAGE_SIZES[2]),
  ]),
});

function connectionAppError(error: unknown): AppError {
  if (!(error instanceof ClarityReportError)) throw error;
  if (error.code === "clarity_setup_required") {
    return new AppError(
      "AUTH_CONFIG_MISSING",
      "Set BETTER_AUTH_SECRET to at least 32 characters before connecting Microsoft Clarity.",
    );
  }
  if (error.code === "clarity_reconnect_required") {
    return new AppError("CLARITY_AUTH_FAILED");
  }
  if (error.code === "clarity_rate_limited") {
    return new AppError("RATE_LIMITED");
  }
  if (
    error.code === "clarity_upstream_unavailable" ||
    error.code === "clarity_malformed_response"
  ) {
    return new AppError("UPSTREAM_UNAVAILABLE");
  }
  return new AppError("INTERNAL_ERROR");
}

export const getClarityConnection = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(({ context }) => ClarityService.getConnection(context.projectId));

export const getClarityInsights = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(clarityInsightsSchema)
  .handler(async ({ data, context }) => {
    const connection = await ClarityService.getConnection(context.projectId);
    if (!connection.connected || !connection.encryptionConfigured) {
      return {
        connected: false as const,
        encryptionConfigured: connection.encryptionConfigured,
      };
    }

    try {
      return await ClarityService.getInsights({
        projectId: context.projectId,
        numOfDays: data.numOfDays,
        page: data.page,
        pageSize: data.pageSize,
      });
    } catch (error) {
      if (
        error instanceof ClarityReportError &&
        error.code === "clarity_not_connected"
      ) {
        return { connected: false as const, encryptionConfigured: true };
      }
      throw connectionAppError(error);
    }
  });

export const connectClarity = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(connectClaritySchema)
  .handler(async ({ data, context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    try {
      const connection = await ClarityService.connect({
        projectId: context.projectId,
        organizationId: context.organizationId,
        userId: context.userId,
        apiToken: data.apiToken,
      });
      waitUntil(
        captureServerEvent({
          distinctId: context.userId,
          event: "clarity:connect",
          organizationId: context.organizationId,
          properties: { project_id: context.projectId },
        }),
      );
      return connection;
    } catch (error) {
      throw connectionAppError(error);
    }
  });

export const disconnectClarity = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    await ClarityService.disconnect(context.projectId);
    waitUntil(
      captureServerEvent({
        distinctId: context.userId,
        event: "clarity:disconnect",
        organizationId: context.organizationId,
        properties: { project_id: context.projectId },
      }),
    );
    return { connected: false as const };
  });
