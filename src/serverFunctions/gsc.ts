import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { waitUntil } from "cloudflare:workers";
import { z } from "zod";
import { GscService } from "@/server/features/gsc/services/GscService";
import { hasSelfHostedGscConfig } from "@/server/features/gsc/oauth-config";
import { createSelfHostedGscAuthorizationUrl } from "@/server/features/gsc/selfHostedOAuth";
import { captureServerEvent } from "@/server/lib/posthog";
import { getPublicOrigin } from "@/server/mcp/public-origin";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import {
  requireAuthenticatedContext,
  requireProjectContext,
} from "@/serverFunctions/middleware";

const projectScopedSchema = z.object({ projectId: z.string().min(1) });
const setSiteSchema = projectScopedSchema.extend({
  siteUrl: z.string().min(1),
});
const startSelfHostedLinkSchema = z.object({
  callbackURL: z.string().min(1),
});

// Account-level grant check (no project needed) for surfaces like onboarding
// where the user hasn't picked a project yet. The OAuth grant is per-account;
// binding a property to a project happens later in Integrations.
export const getGscGrantStatus = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => {
    return { connected: await GscService.userHasGrant(context.userId) };
  });

export const getGscConnection = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => projectScopedSchema.parse(data))
  .handler(async ({ context }) => {
    const [connection, currentUserHasGrant, hosted, gscConfigured] =
      await Promise.all([
        GscService.getConnection(context.projectId),
        GscService.userHasGrant(context.userId),
        isHostedServerAuthMode(),
        hasSelfHostedGscConfig(),
      ]);
    return {
      connected: Boolean(connection),
      currentUserHasGrant,
      googleOAuthConfigured: hosted || gscConfigured,
      siteUrl: connection?.siteUrl ?? null,
      connectedByEmail: connection?.connectedAccountEmail ?? null,
      connectedAt: connection?.createdAt ?? null,
    };
  });

export const listGscSites = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => projectScopedSchema.parse(data))
  .handler(async ({ context }) => {
    const [siteList, connection] = await Promise.all([
      GscService.listSitesForUserWithGrantStatus(context.userId),
      GscService.getConnection(context.projectId),
    ]);
    return {
      requiresReconnect: siteList.requiresReconnect,
      sites: siteList.sites.map((s) => ({
        siteUrl: s.siteUrl,
        permissionLevel: s.permissionLevel,
        selectable: s.permissionLevel !== "siteUnverifiedUser",
        isSelected: s.siteUrl === connection?.siteUrl,
      })),
    };
  });

export const setGscSite = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => setSiteSchema.parse(data))
  .handler(async ({ data, context }) => {
    const connection = await GscService.setSite({
      projectId: context.projectId,
      organizationId: context.organizationId,
      siteUrl: data.siteUrl,
      userId: context.userId,
      userEmail: context.userEmail,
    });
    waitUntil(
      captureServerEvent({
        distinctId: context.userId,
        event: "gsc:property_select",
        organizationId: context.organizationId,
        properties: { project_id: context.projectId, site_url: data.siteUrl },
      }),
    );
    return { connected: true as const, siteUrl: connection.siteUrl };
  });

export const disconnectGsc = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => projectScopedSchema.parse(data))
  .handler(async ({ context }) => {
    await GscService.disconnect({
      projectId: context.projectId,
      userId: context.userId,
    });
    waitUntil(
      captureServerEvent({
        distinctId: context.userId,
        event: "gsc:disconnect",
        organizationId: context.organizationId,
        properties: { project_id: context.projectId },
      }),
    );
    return { connected: false as const };
  });

export const startSelfHostedGscLink = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .inputValidator((data: unknown) => startSelfHostedLinkSchema.parse(data))
  .handler(async ({ data, context }) => {
    const publicOrigin = getPublicOrigin(getRequest());
    const url = await createSelfHostedGscAuthorizationUrl({
      user: {
        userId: context.userId,
        userEmail: context.userEmail,
      },
      callbackURL: data.callbackURL,
      publicOrigin,
    });

    return { url };
  });
