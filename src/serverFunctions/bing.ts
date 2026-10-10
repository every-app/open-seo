import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { waitUntil } from "cloudflare:workers";
import { z } from "zod";
import { BingService } from "@/server/features/bing/services/BingService";
import { BingCredentialService } from "@/server/features/bing/services/BingCredentialService";
import {
  createBingAuthorizationUrl,
  hasBingGrant,
} from "@/server/features/bing/bingOAuth";
import { hasBingOAuthConfig } from "@/server/features/bing/oauth-config";
import {
  BING_GROUP_BY,
  BING_MAX_ROW_LIMIT,
} from "@/server/features/bing/bingPerformance";
import { BingAuthError, BingNotConnectedError } from "@/server/lib/bingErrors";
import { hasOrgPermission } from "@/lib/org-permissions";
import { requireOrgPermission } from "@/server/auth/org-gate";
import { captureServerEvent } from "@/server/lib/posthog";
import { getPublicOrigin } from "@/server/mcp/public-origin";
import {
  requireAuthenticatedContext,
  requireProjectContext,
} from "@/serverFunctions/middleware";

const projectScopedSchema = z.object({ projectId: z.string().min(1) });
const saveKeySchema = z.object({ apiKey: z.string().min(1) });
const removeKeySchema = z.object({ credentialId: z.string().min(1) });
const setSiteSchema = projectScopedSchema.extend({
  // Null selects the connector's delegated OAuth grant.
  credentialId: z.string().min(1).nullable(),
  siteUrl: z.string().min(1),
});
const performanceSchema = projectScopedSchema.extend({
  groupBy: z.enum(BING_GROUP_BY).default("query"),
});
const startLinkSchema = z.object({
  callbackURL: z.string().min(1),
});

export const getBingConnection = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    const [connection, hasCredentials, credentialSummaries, oauthGrant] =
      await Promise.all([
        BingService.getConnection(context.projectId),
        BingCredentialService.hasAnyCredential(context.userId),
        BingCredentialService.listCredentialSummaries(context.userId),
        hasBingGrant(context.userId),
      ]);
    return {
      connected: Boolean(connection),
      canManage: hasOrgPermission(context.role, { integration: ["manage"] }),
      hasCredentials,
      credentialCount: credentialSummaries.length + (oauthGrant ? 1 : 0),
      bingOAuthConfigured: await hasBingOAuthConfig(),
      siteUrl: connection?.siteUrl ?? null,
      connectedAt: connection?.createdAt ?? null,
    };
  });

// The API keys are per OpenSEO user, not per project, so saving one only needs
// an authenticated account — any member may store their own keys. Binding a
// site to a project is the admin-gated step below.
export const saveBingApiKey = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(saveKeySchema)
  .handler(async ({ data, context }) => {
    const summary = await BingCredentialService.saveCredential({
      userId: context.userId,
      apiKey: data.apiKey,
    });
    waitUntil(
      captureServerEvent({
        distinctId: context.userId,
        event: "bing:key_save",
        organizationId: context.organizationId,
        properties: { key_last4: summary.keyLast4 },
      }),
    );
    return summary;
  });

// Account-level list for management surfaces with no project in scope (the
// account settings page). Verifies each credential against Bing like the
// picker, and reports the delegated OAuth grant separately.
export const listBingAccounts = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => {
    const [accounts, bingOAuthConfigured] = await Promise.all([
      BingCredentialService.listAccountsForUser(context.userId),
      hasBingOAuthConfig(),
    ]);
    return { ...accounts, bingOAuthConfigured };
  });

export const removeBingApiKey = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(removeKeySchema)
  .handler(async ({ data, context }) => {
    await BingCredentialService.removeCredential(
      context.userId,
      data.credentialId,
    );
    return { removed: true as const };
  });

export const removeBingOAuthGrant = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => {
    await BingCredentialService.removeOAuthCredential(context.userId);
    waitUntil(
      captureServerEvent({
        distinctId: context.userId,
        event: "bing:oauth_disconnect",
        organizationId: context.organizationId,
        properties: {},
      }),
    );
    return { removed: true as const };
  });

export const listBingSites = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    const [siteList, connection] = await Promise.all([
      BingCredentialService.listSitesForUser(context.userId),
      BingService.getConnection(context.projectId),
    ]);
    return {
      accounts: siteList.accounts.map((account) => ({
        credentialId: account.credentialId,
        keyLast4: account.keyLast4,
        requiresReconnect: account.requiresReconnect,
        unavailable: account.unavailable,
        sites: account.sites.map((site) => ({
          url: site.url,
          selectable: site.isVerified,
          isSelected:
            connection?.connectedByUserId === context.userId &&
            connection.credentialId === account.credentialId &&
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
      credentialId: data.credentialId,
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
    return {
      connected: true as const,
      siteUrl: connection.siteUrl,
      connectedAt: connection.createdAt,
    };
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

export const startBingLink = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(startLinkSchema)
  .handler(async ({ data, context }) => ({
    url: await createBingAuthorizationUrl({
      userId: context.userId,
      callbackURL: data.callbackURL,
      publicOrigin: getPublicOrigin(getRequest()),
    }),
  }));

/** One dataset for the Bing Insights page: the project's connected site, the
 *  coverage window Bing returned, the whole-window total, and the aggregated
 *  rows (capped). Not-connected and a rejected credential both report
 *  `connected: false` so the page renders the connect card. */
export const getBingPerformance = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(performanceSchema)
  .handler(async ({ data, context }) => {
    try {
      const result = await BingService.getPerformance({
        projectId: context.projectId,
        groupBy: data.groupBy,
        rowLimit: BING_MAX_ROW_LIMIT,
      });
      return {
        connected: true as const,
        siteUrl: result.siteUrl,
        groupBy: result.groupBy,
        coverage: result.coverage,
        strikingDistance: result.strikingDistance,
        rows: result.rows,
      };
    } catch (error) {
      if (error instanceof BingNotConnectedError) {
        return { connected: false as const, requiresReconnect: false };
      }
      if (error instanceof BingAuthError) {
        return { connected: false as const, requiresReconnect: true };
      }
      throw error;
    }
  });

/** The connected site's whole-site summary (clicks, impressions, CTR, average
 *  position), so the page paints its stat tiles independently of the table. */
export const getBingSummary = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    try {
      const result = await BingService.getSummary({
        projectId: context.projectId,
      });
      return {
        connected: true as const,
        siteUrl: result.siteUrl,
        coverage: result.coverage,
        summary: result.summary,
        trend: result.trend,
      };
    } catch (error) {
      if (error instanceof BingNotConnectedError) {
        return { connected: false as const, requiresReconnect: false };
      }
      if (error instanceof BingAuthError) {
        return { connected: false as const, requiresReconnect: true };
      }
      throw error;
    }
  });
