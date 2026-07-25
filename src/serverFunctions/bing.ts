import { createServerFn } from "@tanstack/react-start";
import { waitUntil } from "cloudflare:workers";
import { z } from "zod";
import { BingService } from "@/server/features/bing/services/BingService";
import { hasSelfHostedBingConfig } from "@/server/features/bing/oauth-config";
import { captureServerEvent } from "@/server/lib/posthog";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import {
  requireAuthenticatedContext,
  requireProjectContext,
} from "@/serverFunctions/middleware";

const projectScopedSchema = z.object({ projectId: z.string().min(1) });
const setSiteSchema = projectScopedSchema.extend({
  accountId: z.string().min(1),
  siteUrl: z.string().min(1),
});

// Account-level grant check (no project needed) for surfaces like onboarding
// where the user hasn't picked a project yet. The OAuth grant is per-account;
// binding a site to a project happens later in Integrations.
export const getBingGrantStatus = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => {
    return { connected: await BingService.userHasGrant(context.userId) };
  });

export const getBingConnection = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    const [connection, currentUserHasGrant, hosted, bingConfigured] =
      await Promise.all([
        BingService.getConnection(context.projectId),
        BingService.userHasGrant(context.userId),
        isHostedServerAuthMode(),
        hasSelfHostedBingConfig(),
      ]);
    return {
      connected: Boolean(connection),
      currentUserHasGrant,
      bingOAuthConfigured: hosted || bingConfigured,
      siteUrl: connection?.siteUrl ?? null,
      connectedByEmail: connection?.connectedAccountEmail ?? null,
      connectedAt: connection?.createdAt ?? null,
    };
  });

export const listBingSites = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    const [siteList, connection] = await Promise.all([
      BingService.listSitesForUserWithGrantStatus(context.userId),
      BingService.getConnection(context.projectId),
    ]);
    return {
      accounts: siteList.accounts.map((grant) => ({
        accountId: grant.accountId,
        email: grant.email,
        requiresReconnect: grant.requiresReconnect,
        sites: grant.sites.map((site) => ({
          siteUrl: site.url,
          isVerified: site.isVerified,
          selectable: site.isVerified,
          isSelected:
            connection?.bingAccountId === grant.accountId &&
            connection.siteUrl === site.url,
        })),
      })),
    };
  });

export const setBingSite = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(setSiteSchema)
  .handler(async ({ data, context }) => {
    const connection = await BingService.setSite({
      projectId: context.projectId,
      organizationId: context.organizationId,
      accountId: data.accountId,
      siteUrl: data.siteUrl,
      userId: context.userId,
    });
    waitUntil(
      captureServerEvent({
        distinctId: context.userId,
        event: "bing:site_select",
        organizationId: context.organizationId,
        properties: { project_id: context.projectId, site_url: data.siteUrl },
      }),
    );
    return { connected: true as const, siteUrl: connection.siteUrl };
  });

export const disconnectBing = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    await BingService.disconnect({
      projectId: context.projectId,
      userId: context.userId,
    });
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
