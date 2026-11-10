import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { waitUntil } from "cloudflare:workers";
import { z } from "zod";
import { GscService } from "@/server/features/gsc/services/GscService";
import { GoogleServiceAccountService } from "@/server/features/google/GoogleServiceAccountService";
import { hasGoogleOAuthConfig } from "@/server/features/google/oauth-config";
import { getGoogleAccessMode } from "@/server/features/google/googleAccess";
import { getGatewayGoogleConnectUrl } from "@/server/features/google/gatewayGoogle";
import {
  createGoogleAuthorizationUrl,
  GSC_INTEGRATION,
} from "@/server/features/google/googleOAuth";
import { hasOrgPermission } from "@/lib/org-permissions";
import { AppError } from "@/server/lib/errors";
import { requireOrgPermission } from "@/server/auth/org-gate";
import { captureServerEvent } from "@/server/lib/posthog";
import { markOnboardingMilestone } from "@/server/email/onboarding-drip";
import { getPublicOrigin } from "@/server/mcp/public-origin";
import { captureMetaSetupStep, MetaSetupEvent } from "@/server/referrals/meta";
import {
  requireAuthenticatedContext,
  requireProjectContext,
} from "@/serverFunctions/middleware";

const projectScopedSchema = z.object({ projectId: z.string().min(1) });
const setSiteSchema = projectScopedSchema.extend({
  accountId: z.string().min(1),
  siteUrl: z.string().min(1),
});
const startLinkSchema = z.object({
  callbackURL: z.string().min(1),
});
// A key file is a few KB; the cap only stops absurd uploads.
const addServiceAccountSchema = z.object({
  keyJson: z.string().min(1).max(20_000),
});
const removeServiceAccountSchema = z.object({ id: z.string().min(1) });

// Account-level grant check (no project needed) for surfaces like onboarding
// where the user hasn't picked a project yet. The OAuth grant is per-account;
// binding a property to a project happens later in Integrations.
export const getGscGrantStatus = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => {
    return { connected: await GscService.userHasGrant(context) };
  });

export const getGscConnection = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    const [
      connection,
      currentUserHasGrant,
      googleOAuthConfigured,
      serviceAccountsEnabled,
    ] = await Promise.all([
      GscService.getConnection(context.projectId),
      GscService.userHasGrant(context),
      hasGoogleOAuthConfig(),
      GoogleServiceAccountService.isEnabled(),
    ]);
    return {
      connected: Boolean(connection),
      serviceAccountsEnabled,
      canManage: hasOrgPermission(context.role, { integration: ["manage"] }),
      currentUserHasGrant,
      googleOAuthConfigured,
      siteUrl: connection?.siteUrl ?? null,
      connectedByEmail: connection?.connectedAccountEmail ?? null,
      connectedAt: connection?.createdAt ?? null,
    };
  });

export const listGscSites = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    const [siteList, connection] = await Promise.all([
      GscService.listSitesForUserWithGrantStatus(context),
      GscService.getConnection(context.projectId),
    ]);
    const legacyAccounts = !connection?.gscAccountId
      ? siteList.accounts.filter((grant) =>
          grant.sites.some((site) => site.siteUrl === connection?.siteUrl),
        )
      : [];
    const unambiguousLegacyAccountId =
      legacyAccounts.length === 1 ? legacyAccounts[0]?.accountId : undefined;
    return {
      accounts: siteList.accounts.map((grant) => ({
        accountId: grant.accountId,
        kind: grant.kind,
        email: grant.email,
        requiresReconnect: grant.requiresReconnect,
        propertiesUnavailable: grant.propertiesUnavailable,
        apiDisabled: grant.apiDisabled,
        sites: grant.sites.map((site) => {
          const isSelected = connection?.gscAccountId
            ? connection.gscAccountId === grant.accountId &&
              connection.siteUrl === site.siteUrl
            : unambiguousLegacyAccountId === grant.accountId &&
              connection?.siteUrl === site.siteUrl;
          return {
            siteUrl: site.siteUrl,
            permissionLevel: site.permissionLevel,
            selectable: site.permissionLevel !== "siteUnverifiedUser",
            isSelected,
          };
        }),
      })),
    };
  });

export const setGscSite = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(setSiteSchema)
  .handler(async ({ data, context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    const connection = await GscService.setSite({
      projectId: context.projectId,
      organizationId: context.organizationId,
      accountId: data.accountId,
      siteUrl: data.siteUrl,
      userId: context.userId,
    });
    await markOnboardingMilestone(context, "gscConnected");
    await captureMetaSetupStep(
      MetaSetupEvent.SearchConsoleConnected,
      context.organizationId,
      getRequest(),
    );
    waitUntil(
      captureServerEvent({
        distinctId: context.userId,
        event: "gsc:property_select",
        organizationId: context.organizationId,
        properties: { project_id: context.projectId },
      }),
    );
    return {
      connected: true as const,
      siteUrl: connection.siteUrl,
      connectedByEmail: connection.connectedAccountEmail,
      connectedAt: connection.createdAt,
    };
  });

export const disconnectGsc = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    await GscService.disconnect({ projectId: context.projectId });
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

// Behind the gateway the connect page is the gateway's: one Google
// connection per member serves Search Console and Analytics alike, and the
// gateway sends the person back to `callbackURL` afterwards.
export const startGscLink = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(startLinkSchema)
  .handler(async ({ data, context }) => ({
    url:
      (await getGoogleAccessMode()) === "gateway"
        ? await getGatewayGoogleConnectUrl(data.callbackURL)
        : await createGoogleAuthorizationUrl({
            integration: GSC_INTEGRATION,
            userId: context.userId,
            callbackURL: data.callbackURL,
            publicOrigin: getPublicOrigin(getRequest()),
          }),
  }));

// Service account keys belong to the organization. Only the account email
// and usage come back; the private key never leaves the server.
export const listGscServiceAccounts = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => ({
    enabled: await GoogleServiceAccountService.isEnabled(),
    accounts: await GoogleServiceAccountService.listSummaries(
      context.organizationId,
    ),
  }));

export const addGscServiceAccount = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(addServiceAccountSchema)
  .handler(async ({ data, context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    let saved;
    try {
      saved = await GoogleServiceAccountService.add({
        organizationId: context.organizationId,
        userId: context.userId,
        keyJson: data.keyJson,
      });
    } catch (error) {
      // What's wrong with the file is the answer the form shows, and thrown
      // errors reach the client stripped to their code.
      if (error instanceof AppError && error.code === "VALIDATION_ERROR") {
        return { ok: false as const, message: error.message };
      }
      throw error;
    }
    waitUntil(
      captureServerEvent({
        distinctId: context.userId,
        event: "gsc:service_account_add",
        organizationId: context.organizationId,
      }),
    );
    return { ok: true as const, id: saved.id, clientEmail: saved.clientEmail };
  });

export const removeGscServiceAccount = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(removeServiceAccountSchema)
  .handler(async ({ data, context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    return GscService.removeServiceAccount({
      organizationId: context.organizationId,
      id: data.id,
    });
  });
