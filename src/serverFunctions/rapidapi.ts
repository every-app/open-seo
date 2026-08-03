import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  RapidapiService,
  RapidapiNotConnectedError,
} from "@/server/features/revenue/services/RapidapiService";
import {
  hasRapidapiConfig,
  isExpectedRapidapiFailure,
} from "@/server/lib/rapidapiClient";
import { requireProjectContext } from "@/serverFunctions/middleware";

const projectScopedSchema = z.object({ projectId: z.string().min(1) });
const setApiSchema = projectScopedSchema.extend({
  rapidapiApiId: z.string().min(1).max(200),
});

export const getRapidapiConnection = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    const [connection, configConfigured] = await Promise.all([
      RapidapiService.getConnection(context.projectId),
      hasRapidapiConfig(),
    ]);
    return {
      connected: Boolean(connection),
      configConfigured,
      rapidapiApiId: connection?.rapidapiApiId ?? null,
      rapidapiApiName: connection?.rapidapiApiName ?? null,
      connectedAt: connection?.createdAt ?? null,
    };
  });

export const setRapidapiApi = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(setApiSchema)
  .handler(async ({ data, context }) => {
    const connection = await RapidapiService.setApi({
      projectId: context.projectId,
      organizationId: context.organizationId,
      rapidapiApiId: data.rapidapiApiId,
      userId: context.userId,
    });
    return {
      connected: true as const,
      rapidapiApiId: connection.rapidapiApiId,
      rapidapiApiName: connection.rapidapiApiName,
    };
  });

export const disconnectRapidapi = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    await RapidapiService.disconnect(context.projectId);
    return { connected: false as const };
  });

/**
 * Subscriber metrics for the connected RapidAPI listing: active and paying
 * counts plus 30-day new/churn with a prior-30-day comparison. Not connected
 * — or a rejected key — resolves to { connected: false } so the page renders
 * the setup card instead of an error boundary.
 */
export const getRapidapiSubscriptions = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    try {
      const report = await RapidapiService.getSubscriptionReport({
        projectId: context.projectId,
      });
      return { connected: true as const, ...report };
    } catch (error) {
      if (
        error instanceof RapidapiNotConnectedError ||
        isExpectedRapidapiFailure(error)
      ) {
        return { connected: false as const };
      }
      throw error;
    }
  });
