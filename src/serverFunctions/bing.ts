import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { waitUntil } from "cloudflare:workers";
import { z } from "zod";
import {
  BingNotConnectedError,
  BingService,
  isExpectedGrantFailure,
} from "@/server/features/bing/services/BingService";
import { hasBingOAuthConfig } from "@/server/features/bing/oauth-config";
import { createSelfHostedBingAuthorizationUrl } from "@/server/features/bing/selfHostedOAuth";
import { requireOrgPermission } from "@/server/auth/org-gate";
import { captureServerEvent } from "@/server/lib/posthog";
import { getPublicOrigin } from "@/server/mcp/public-origin";
import {
  requireAuthenticatedContext,
  requireProjectContext,
} from "@/serverFunctions/middleware";

const projectScopedSchema = z.object({ projectId: z.string().min(1) });
const startSelfHostedLinkSchema = z.object({
  callbackURL: z.string().min(1),
});
const setSiteSchema = projectScopedSchema.extend({
  accountId: z.string().min(1),
  siteUrl: z.string().min(1),
});

export const getBingConnection = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    const [connection, currentUserHasGrant, bingConfigured] = await Promise.all(
      [
        BingService.getConnection(context.projectId),
        BingService.userHasGrant(context.userId),
        hasBingOAuthConfig(),
      ],
    );
    return {
      connected: Boolean(connection),
      currentUserHasGrant,
      bingOAuthConfigured: bingConfigured,
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
    requireOrgPermission(context, { integration: ["manage"] });
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
    requireOrgPermission(context, { integration: ["manage"] });
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

/**
 * Daily clicks/impressions for the project's connected Bing site.
 *
 * Bing's GetRankAndTrafficStats takes no date range, no dimensions, and no
 * paging — it returns whatever window Bing decides to give. That is why this
 * has none of the filter arguments the Search Console report takes, and why
 * the Bing surface is separate rather than a source toggle on it.
 *
 * Not connected, or a dead grant, resolves to { connected: false } so the page
 * renders the connect card instead of an error boundary.
 */
export const getBingPerformance = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    try {
      const result = await BingService.getPerformance({
        projectId: context.projectId,
      });
      return {
        connected: true as const,
        siteUrl: result.siteUrl,
        connectedBy: result.connectedBy,
        rows: result.rows,
      };
    } catch (error) {
      if (
        error instanceof BingNotConnectedError ||
        isExpectedGrantFailure(error)
      ) {
        return { connected: false as const };
      }
      throw error;
    }
  });

/** Sampled keyword rows for the project's connected Bing site. Bing chooses
 * the native reporting window and exposes no paging or date-range controls. */
export const getBingKeywords = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    try {
      const result = await BingService.getKeywords({
        projectId: context.projectId,
      });
      return {
        connected: true as const,
        siteUrl: result.siteUrl,
        connectedBy: result.connectedBy,
        rows: result.rows,
      };
    } catch (error) {
      if (
        error instanceof BingNotConnectedError ||
        isExpectedGrantFailure(error)
      ) {
        return { connected: false as const };
      }
      throw error;
    }
  });

/**
 * Begin the Bing OAuth grant on a self-hosted deployment.
 *
 * Better Auth's `oauth2.link` requires a Better Auth session, which does not
 * exist under `cloudflare_access` or `local_noauth`; those modes use this
 * hand-rolled flow instead, exactly as Search Console does.
 */
export const startSelfHostedBingLink = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(startSelfHostedLinkSchema)
  .handler(async ({ data, context }) => {
    const publicOrigin = getPublicOrigin(getRequest());
    const url = await createSelfHostedBingAuthorizationUrl({
      user: { userId: context.userId, userEmail: context.userEmail },
      callbackURL: data.callbackURL,
      publicOrigin,
    });

    return { url };
  });
