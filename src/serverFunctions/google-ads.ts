import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { waitUntil } from "cloudflare:workers";
import { z } from "zod";
import { GoogleAdsService } from "@/server/features/google-ads/services/GoogleAdsService";
import { LocalServicesReportingService } from "@/server/features/google-ads/services/LocalServicesReportingService";
import {
  getStoredRefreshHealth,
  probeAndRecordRefreshHealth,
} from "@/server/features/google/services/GoogleIntegrationTokenHealthService";
import { hasGoogleOAuthConfig } from "@/server/features/google/oauth-config";
import {
  createGoogleAuthorizationUrl,
  GOOGLE_ADS_INTEGRATION,
} from "@/server/features/google/googleOAuth";
import { requireOrgPermission } from "@/server/auth/org-gate";
import { AppError } from "@/server/lib/errors";
import { GoogleAdsReportError } from "@/server/lib/googleAdsErrors";
import {
  getOptionalEnvValue,
  isHostedServerAuthMode,
} from "@/server/lib/runtime-env";
import { captureServerEvent } from "@/server/lib/posthog";
import { getPublicOrigin } from "@/server/mcp/public-origin";
import {
  requireAuthenticatedContext,
  requireProjectContext,
} from "@/serverFunctions/middleware";

const projectScopedSchema = z.object({ projectId: z.string().min(1) });
const setAccountSchema = projectScopedSchema.extend({
  accountId: z.string().min(1),
  customerId: z.string().regex(/^\d+$/),
  // The manager the picker listed this account under, null when the grant
  // reaches it directly. Verified against the grant server-side before use.
  loginCustomerId: z.string().regex(/^\d+$/).nullable(),
});
const startLinkSchema = z.object({
  callbackURL: z.string().min(1),
});

async function hasDeveloperToken(): Promise<boolean> {
  return Boolean(
    (await getOptionalEnvValue("GOOGLE_ADS_DEVELOPER_TOKEN"))?.trim(),
  );
}

export const getGoogleAdsConnection = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    const [connection, currentUserHasGrant, hosted, oauthConfigured, adsToken] =
      await Promise.all([
        GoogleAdsService.getConnection(context.projectId),
        GoogleAdsService.userHasGrant(context.userId),
        isHostedServerAuthMode(),
        hasGoogleOAuthConfig(),
        hasDeveloperToken(),
      ]);
    const health = connection
      ? await probeAndRecordRefreshHealth({
          integration: "google_ads",
          providerId: GOOGLE_ADS_INTEGRATION.providerId,
          projectId: context.projectId,
          connectedByUserId: connection.connectedByUserId,
          accountId: connection.googleAdsAccountId,
        })
      : null;
    const storedHealth = await getStoredRefreshHealth({
      projectId: context.projectId,
      integration: "google_ads",
    });
    const reconnectRequired = Boolean(connection && health && !health.healthy);
    return {
      connected: Boolean(connection) && !reconnectRequired,
      reconnectRequired,
      currentUserHasGrant,
      googleOAuthConfigured: hosted || oauthConfigured,
      developerTokenConfigured: adsToken,
      customerId: connection?.customerId ?? null,
      customerDescriptiveName: connection?.customerDescriptiveName ?? null,
      currencyCode: connection?.currencyCode ?? null,
      connectedByEmail: connection?.connectedAccountEmail ?? null,
      connectedAt: connection?.createdAt ?? null,
      lastSuccessfulRefreshAt: storedHealth?.lastSuccessfulRefreshAt ?? null,
      lastRefreshErrorAt: storedHealth?.lastRefreshErrorAt ?? null,
      lastRefreshErrorCode: storedHealth?.lastRefreshErrorCode ?? null,
    };
  });

/** The dashboard's Local Services card: last-28-days spend/lead totals plus
 *  pacing against the weekly budget. */
export const getLocalServicesDashboardReport = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    try {
      // No range: the service builds the last 28 days from the Ads account's
      // own time zone, which is the one Google reads segments.date in.
      const performance = await LocalServicesReportingService.getPerformance({
        projectId: context.projectId,
      });
      return {
        connected: true as const,
        accessPending: false,
        requestRejected: false,
        performance,
      };
    } catch (error) {
      // Not connected, dead grant, or setup states: the card falls back to
      // the connect card (or its access-pending copy) instead of erroring.
      if (error instanceof GoogleAdsReportError) {
        if (error.code === "google_ads_access_pending") {
          return { connected: true as const, accessPending: true as const };
        }
        if (error.code === "google_ads_request_rejected") {
          // A 400 is a broken query, not an outage. Returning a flag lets
          // the card say retrying won't help instead of "try again shortly".
          return { connected: true as const, requestRejected: true as const };
        }
        if (
          error.code === "google_ads_not_connected" ||
          error.code === "google_ads_reconnect_required" ||
          error.code === "google_ads_setup_required" ||
          error.code === "google_ads_account_inaccessible"
        ) {
          return { connected: false as const };
        }
        if (error.code === "google_ads_quota_exhausted") {
          throw new AppError("RATE_LIMITED");
        }
      }
      throw error;
    }
  });

export const listGoogleAdsAccounts = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    const [accountList, connection] = await Promise.all([
      GoogleAdsService.listAccountsForUserWithGrantStatus(context.userId),
      GoogleAdsService.getConnection(context.projectId),
    ]);
    return {
      accounts: accountList.accounts.map((grant) => ({
        ...grant,
        accounts: grant.accounts.map((candidate) => ({
          ...candidate,
          isSelected:
            connection?.googleAdsAccountId === grant.accountId &&
            connection.customerId === candidate.customerId,
        })),
      })),
    };
  });

export const setGoogleAdsAccount = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(setAccountSchema)
  .handler(async ({ data, context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    const connection = await GoogleAdsService.setAccount({
      projectId: context.projectId,
      organizationId: context.organizationId,
      accountId: data.accountId,
      customerId: data.customerId,
      loginCustomerId: data.loginCustomerId,
      userId: context.userId,
    });
    waitUntil(
      captureServerEvent({
        distinctId: context.userId,
        event: "google_ads:account_select",
        organizationId: context.organizationId,
        properties: { project_id: context.projectId },
      }),
    );
    return {
      connected: true as const,
      customerId: connection.customerId,
      customerDescriptiveName: connection.customerDescriptiveName,
    };
  });

export const disconnectGoogleAds = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    await GoogleAdsService.disconnect({
      projectId: context.projectId,
      userId: context.userId,
    });
    waitUntil(
      captureServerEvent({
        distinctId: context.userId,
        event: "google_ads:disconnect",
        organizationId: context.organizationId,
        properties: { project_id: context.projectId },
      }),
    );
    return { connected: false as const };
  });

export const startGoogleAdsLink = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(startLinkSchema)
  .handler(async ({ data, context }) => ({
    url: await createGoogleAuthorizationUrl({
      integration: GOOGLE_ADS_INTEGRATION,
      userId: context.userId,
      callbackURL: data.callbackURL,
      publicOrigin: getPublicOrigin(getRequest()),
    }),
  }));
