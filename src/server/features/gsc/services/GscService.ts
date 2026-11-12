import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { account } from "@/db/schema";
import { GSC_OAUTH_PROVIDER_ID } from "@/shared/gsc";
import { AppError } from "@/server/lib/errors";
import { getGoogleAccessMode } from "@/server/features/google/googleAccess";
import {
  GATEWAY_GOOGLE_ACCOUNT_ID,
  getGatewayGoogleStatus,
} from "@/server/features/google/gatewayGoogle";
import {
  createGscClient,
  type GscSite,
  type UrlInspectionResult,
} from "@/server/lib/gscClient";
import {
  GscApiError,
  GscNotConnectedError,
  GscTokenError,
} from "@/server/lib/gscErrors";
export { GscNotConnectedError } from "@/server/lib/gscErrors";
import {
  buildSearchAnalyticsRequest,
  type GscPerformanceInput,
} from "@/server/features/gsc/searchAnalytics";
import {
  GscConnectionRepository,
  type GscConnection,
} from "@/server/features/gsc/repositories/GscConnectionRepository";
import { DashboardCacheService } from "@/server/features/dashboard/services/DashboardCacheService";
import { GoogleServiceAccountService } from "@/server/features/google/GoogleServiceAccountService";
import type {
  GscSearchAnalyticsRequest,
  GscSearchAnalyticsRow,
} from "@/server/lib/gscClient";

const SITE_UNVERIFIED_PERMISSION = "siteUnverifiedUser";

type GscPerformanceResult = {
  siteUrl: string;
  connectedBy: string | null;
  request: GscSearchAnalyticsRequest;
  rows: GscSearchAnalyticsRow[];
};

type GscSiteListResult = {
  accounts: Array<{
    accountId: string;
    kind: GscAccountKind;
    email: string | null;
    requiresReconnect: boolean;
    propertiesUnavailable: boolean;
    apiDisabled: boolean;
    sites: GscSite[];
  }>;
};

/** Thrown when a project has no connected GSC property. */
async function getConnection(projectId: string): Promise<GscConnection | null> {
  return GscConnectionRepository.getByProjectId(projectId);
}

type GscAccountKind = "google_account" | "service_account";

/** Something a member can pick a property through: their own Google grant,
 *  or a service account key their organization uploaded. */
type GscAccess = {
  accountId: string;
  kind: GscAccountKind;
  /** Known up front for service accounts; Google accounts look it up. */
  email: string | null;
  serviceAccountId?: string;
};

type MemberScope = { userId: string; organizationId: string };

/** Whether this member can reach Search Console at all: a linked
 *  google-search-console grant or an organization service account (regardless
 *  of whether they've picked a property yet). Drives the connect-vs-pick UI. */
async function userHasGrant(scope: MemberScope): Promise<boolean> {
  const serviceAccounts = await GoogleServiceAccountService.listForOrganization(
    scope.organizationId,
  );
  if (serviceAccounts.length > 0) return true;
  if ((await getGoogleAccessMode()) === "gateway") {
    return (await getGatewayGoogleStatus()).connected;
  }
  const userId = scope.userId;
  const rows = await db
    .select({ id: account.id })
    .from(account)
    .where(
      and(
        eq(account.userId, userId),
        eq(account.providerId, GSC_OAUTH_PROVIDER_ID),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * What a member may pick a property through: their Google accounts, then the
 * organization's service accounts. Behind the gateway there is one Google
 * account, their gateway connection (gatewayGoogle.ts), and only while it is
 * connected; service accounts are never offered there.
 */
async function listAccessForMember(scope: MemberScope): Promise<GscAccess[]> {
  if ((await getGoogleAccessMode()) === "gateway") {
    return (await getGatewayGoogleStatus()).connected
      ? [
          {
            accountId: GATEWAY_GOOGLE_ACCOUNT_ID,
            kind: "google_account",
            email: null,
          },
        ]
      : [];
  }
  const [grants, serviceAccounts] = await Promise.all([
    db
      .select({ accountId: account.accountId })
      .from(account)
      .where(
        and(
          eq(account.userId, scope.userId),
          eq(account.providerId, GSC_OAUTH_PROVIDER_ID),
        ),
      ),
    GoogleServiceAccountService.listForOrganization(scope.organizationId),
  ]);
  return [
    ...grants.map(
      (grant): GscAccess => ({
        accountId: grant.accountId,
        kind: "google_account",
        email: null,
      }),
    ),
    ...serviceAccounts.map(
      (row): GscAccess => ({
        accountId: row.id,
        kind: "service_account",
        email: row.clientEmail,
        serviceAccountId: row.id,
      }),
    ),
  ];
}

/** The account's email: stored for service accounts, which can't call the
 *  userinfo endpoint, and looked up for Google accounts. */
async function accessEmail(
  access: GscAccess,
  client: ReturnType<typeof createGscClient>,
): Promise<string | null> {
  if (access.kind === "service_account") return access.email;
  try {
    return await client.getUserInfoEmail();
  } catch {
    return null;
  }
}

/** Expected ways a stored grant fails to reach Search Console: no token could be
 *  minted (refresh token revoked or expired), or Google rejected the call
 *  (401/403). These surface a reconnect prompt without fault logging. */
export function isExpectedGrantFailure(error: unknown): boolean {
  if (error instanceof GscTokenError) return true;
  return (
    error instanceof GscApiError &&
    (error.status === 401 || error.status === 403)
  );
}

async function listSitesForUserWithGrantStatus(
  scope: MemberScope,
): Promise<GscSiteListResult> {
  const grants = await listAccessForMember(scope);
  const accounts = await Promise.all(
    grants.map(async (grant) => {
      const client = createGscClient({
        userId: scope.userId,
        gscAccountId: grant.accountId,
        serviceAccountId: grant.serviceAccountId,
      });

      try {
        const sites = await client.listSites();
        const email = await accessEmail(grant, client);
        return {
          accountId: grant.accountId,
          kind: grant.kind,
          email,
          requiresReconnect: false,
          propertiesUnavailable: false,
          apiDisabled: false,
          sites,
        };
      } catch (error) {
        // A disabled API is a self-host setup fault, not a dead grant:
        // reconnecting can't fix it, so log it and show the setup message.
        const apiDisabled = error instanceof GscApiError && error.apiDisabled;
        const requiresReconnect = isExpectedGrantFailure(error) && !apiDisabled;
        if (!requiresReconnect) {
          console.error(
            "Failed to list Search Console sites for account",
            grant.accountId,
            error,
          );
        }
        return {
          accountId: grant.accountId,
          kind: grant.kind,
          email: grant.email,
          requiresReconnect,
          propertiesUnavailable: !requiresReconnect,
          apiDisabled,
          sites: [],
        };
      }
    }),
  );
  return { accounts };
}

/** Map a verified property to a project. Rejects unverified properties and
 *  properties not present on the connector's grant. */
async function setSite(input: {
  projectId: string;
  organizationId: string;
  siteUrl: string;
  accountId: string;
  userId: string;
}): Promise<GscConnection> {
  const grants = await listAccessForMember(input);
  const access = grants.find((grant) => grant.accountId === input.accountId);
  if (!access) {
    throw new AppError(
      "NOT_FOUND",
      "That Google account isn't connected to your OpenSEO account.",
    );
  }

  const client = createGscClient({
    userId: input.userId,
    gscAccountId: input.accountId,
    serviceAccountId: access.serviceAccountId,
  });
  const sites = await client.listSites();
  const match = sites.find((s) => s.siteUrl === input.siteUrl);
  if (!match) {
    throw new AppError(
      "NOT_FOUND",
      "That Search Console property isn't available on your connected Google account.",
    );
  }
  if (match.permissionLevel === SITE_UNVERIFIED_PERMISSION) {
    throw new AppError(
      "FORBIDDEN",
      "You don't have verified access to that Search Console property.",
    );
  }
  const connectedAccountEmail = await accessEmail(access, client);
  return GscConnectionRepository.upsert({
    projectId: input.projectId,
    organizationId: input.organizationId,
    siteUrl: input.siteUrl,
    connectedByUserId: input.userId,
    gscAccountId: input.accountId,
    serviceAccountId: access.serviceAccountId ?? null,
    connectedAccountEmail,
  });
}

/** Deletes an organization's service account key, which disconnects the
 *  projects that used it. */
async function removeServiceAccount(input: {
  organizationId: string;
  id: string;
}): Promise<{ disconnectedProjects: number }> {
  const projectIds = await GoogleServiceAccountService.remove(input);
  await Promise.all(
    projectIds.map((projectId) =>
      DashboardCacheService.deleteGscCache(projectId),
    ),
  );
  return { disconnectedProjects: projectIds.length };
}

async function disconnect(input: { projectId: string }): Promise<void> {
  await GscConnectionRepository.deleteByProjectId(input.projectId);
  await DashboardCacheService.deleteGscCache(input.projectId);
}

/** Pass-through of GSC `searchAnalytics.query` for a project's connected property. */
async function getPerformance(
  input: GscPerformanceInput,
): Promise<GscPerformanceResult> {
  const connection = await GscConnectionRepository.getByProjectId(
    input.projectId,
  );
  if (!connection) {
    throw new GscNotConnectedError(input.projectId);
  }
  const request = buildSearchAnalyticsRequest(input);
  // The MCP input schema caps tool responses at 1,000; app consumers may
  // request Google's full page to compare low-click keywords accurately.
  if (input.rowLimit !== undefined)
    request.rowLimit = Math.max(1, Math.min(25000, input.rowLimit));

  const client = createGscClient({
    userId: connection.connectedByUserId,
    gscAccountId: connection.gscAccountId ?? undefined,
    serviceAccountId: connection.serviceAccountId ?? undefined,
  });
  const rows = await client.querySearchAnalytics(connection.siteUrl, request);
  return {
    siteUrl: connection.siteUrl,
    connectedBy: connection.connectedAccountEmail,
    request,
    rows,
  };
}

type GscUrlInspection = {
  url: string;
  result: UrlInspectionResult | null;
  error?: string;
};

type GscInspectUrlsResult = {
  siteUrl: string;
  connectedBy: string | null;
  results: GscUrlInspection[];
};

/** Inspect 1–N URLs against a project's connected property. Resolves the
 *  connection once, then inspects every URL at once: Google answers each
 *  inspection in ~6 s, so a serial batch of ten held the request open for a
 *  minute and made it the usual casualty whenever its isolate ran out of
 *  memory. Per-URL failures are captured inline so one bad URL doesn't fail
 *  the batch. Token/grant failures propagate so the caller can prompt a
 *  reconnect. */
async function inspectUrls(input: {
  projectId: string;
  urls: string[];
  languageCode?: string;
}): Promise<GscInspectUrlsResult> {
  const connection = await GscConnectionRepository.getByProjectId(
    input.projectId,
  );
  if (!connection) {
    throw new GscNotConnectedError(input.projectId);
  }
  const client = createGscClient({
    userId: connection.connectedByUserId,
    gscAccountId: connection.gscAccountId ?? undefined,
    serviceAccountId: connection.serviceAccountId ?? undefined,
  });
  const results = await Promise.all(
    input.urls.map(async (url): Promise<GscUrlInspection> => {
      try {
        const result = await client.inspectUrl(
          connection.siteUrl,
          url,
          input.languageCode,
        );
        return { url, result };
      } catch (error) {
        if (error instanceof GscTokenError) throw error;
        return {
          url,
          result: null,
          error: error instanceof Error ? error.message : "Inspection failed",
        };
      }
    }),
  );
  return {
    siteUrl: connection.siteUrl,
    connectedBy: connection.connectedAccountEmail,
    results,
  };
}

export const GscService = {
  getConnection,
  userHasGrant,
  listSitesForUserWithGrantStatus,
  setSite,
  disconnect,
  removeServiceAccount,
  getPerformance,
  inspectUrls,
};
