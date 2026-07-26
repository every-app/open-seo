import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  VercelAnalyticsService,
  VercelNotConnectedError,
} from "@/server/features/vercel/services/VercelAnalyticsService";
import {
  hasVercelToken,
  isExpectedVercelFailure,
} from "@/server/lib/vercelAnalytics";
import { requireProjectContext } from "@/serverFunctions/middleware";

const projectScopedSchema = z.object({ projectId: z.string().min(1) });
const setProjectSchema = projectScopedSchema.extend({
  vercelProjectId: z.string().min(1),
});

export const getVercelConnection = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    const [connection, tokenConfigured] = await Promise.all([
      VercelAnalyticsService.getConnection(context.projectId),
      hasVercelToken(),
    ]);
    return {
      connected: Boolean(connection),
      tokenConfigured,
      vercelProjectName: connection?.vercelProjectName ?? null,
      connectedAt: connection?.createdAt ?? null,
    };
  });

export const listVercelProjects = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    const projects = await VercelAnalyticsService.listProjectsForPicker(
      context.projectId,
    );
    return { projects };
  });

export const setVercelProject = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(setProjectSchema)
  .handler(async ({ data, context }) => {
    const connection = await VercelAnalyticsService.setProject({
      projectId: context.projectId,
      organizationId: context.organizationId,
      vercelProjectId: data.vercelProjectId,
      userId: context.userId,
    });
    return {
      connected: true as const,
      vercelProjectName: connection.vercelProjectName,
    };
  });

export const disconnectVercel = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    await VercelAnalyticsService.disconnect(context.projectId);
    return { connected: false as const };
  });

/**
 * 30-day traffic report with an exact prior-period comparison, plus the
 * daily series, top referrers, and top pages. Not connected — or a revoked
 * VERCEL_TOKEN — resolves to { connected: false } so the page renders the
 * setup card instead of an error boundary.
 */
export const getVercelTraffic = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    try {
      const report = await VercelAnalyticsService.getTraffic({
        projectId: context.projectId,
      });
      return { connected: true as const, ...report };
    } catch (error) {
      if (
        error instanceof VercelNotConnectedError ||
        isExpectedVercelFailure(error)
      ) {
        return { connected: false as const };
      }
      throw error;
    }
  });
