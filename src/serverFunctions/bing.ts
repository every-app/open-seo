import { createServerFn } from "@tanstack/react-start";
import { waitUntil } from "cloudflare:workers";
import { BingService } from "@/server/features/bing/services/BingService";
import { hasOrgPermission } from "@/lib/org-permissions";
import { requireOrgPermission } from "@/server/auth/org-gate";
import { captureServerEvent } from "@/server/lib/posthog";
import {
  projectScopedBingSchema,
  saveBingApiKeySchema,
  setBingSiteSchema,
} from "@/types/schemas/bing-performance";
import {
  requireAuthenticatedContext,
  requireProjectContext,
} from "@/serverFunctions/middleware";

export const getBingConnection = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedBingSchema)
  .handler(async ({ context }) => {
    const [connection, currentUserHasKey] = await Promise.all([
      BingService.getConnection(context.projectId),
      BingService.userHasKey(context.userId),
    ]);
    return {
      connected: Boolean(connection),
      canManage: hasOrgPermission(context.role, { integration: ["manage"] }),
      currentUserHasKey,
      siteUrl: connection?.siteUrl ?? null,
      connectedAt: connection?.createdAt ?? null,
    };
  });

export const saveBingApiKey = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(saveBingApiKeySchema)
  .handler(async ({ data, context }) => {
    const { sites } = await BingService.saveApiKey({
      userId: context.userId,
      apiKey: data.apiKey,
    });
    return { saved: true as const, sites };
  });

export const listBingSites = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => {
    const sites = await BingService.listSitesForUser(context.userId);
    return { sites };
  });

export const setBingSite = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(setBingSiteSchema)
  .handler(async ({ data, context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    const connection = await BingService.setSite({
      projectId: context.projectId,
      organizationId: context.organizationId,
      siteUrl: data.siteUrl,
      userId: context.userId,
    });
    waitUntil(
      captureServerEvent({
        distinctId: context.userId,
        event: "bing:property_select",
        organizationId: context.organizationId,
        properties: { project_id: context.projectId, site_url: data.siteUrl },
      }),
    );
    return {
      connected: true as const,
      siteUrl: connection.siteUrl,
      connectedAt: connection.createdAt,
    };
  });

export const disconnectBing = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedBingSchema)
  .handler(async ({ context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    await BingService.disconnect({ projectId: context.projectId });
    waitUntil(
      captureServerEvent({
        distinctId: context.userId,
        event: "bing:disconnect",
        organizationId: context.organizationId,
        properties: { project_id: context.projectId },
      }),
    );
    return { connected: false as const };
  });
