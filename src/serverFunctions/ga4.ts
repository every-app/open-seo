import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { waitUntil } from "cloudflare:workers";
import { z } from "zod";
import { shiftGa4Date } from "@/server/features/ga4/services/Ga4Dates";
import { Ga4OrganicOverviewService } from "@/server/features/ga4/services/Ga4OrganicOverviewService";
import { Ga4Service } from "@/server/features/ga4/services/Ga4Service";
import { AppError } from "@/server/lib/errors";
import { Ga4ReportError } from "@/server/lib/ga4Errors";
import {
  getStoredRefreshHealth,
  probeAndRecordRefreshHealth,
} from "@/server/features/google/services/GoogleIntegrationTokenHealthService";
import { hasGoogleOAuthConfig } from "@/server/features/google/oauth-config";
import { getGoogleAccessMode } from "@/server/features/google/googleAccess";
import { getGatewayGoogleConnectUrl } from "@/server/features/google/gatewayGoogle";
import {
  createGoogleAuthorizationUrl,
  GA4_INTEGRATION,
} from "@/server/features/google/googleOAuth";
import { hasOrgPermission } from "@/lib/org-permissions";
import { requireOrgPermission } from "@/server/auth/org-gate";
import { captureServerEvent } from "@/server/lib/posthog";
import { getPublicOrigin } from "@/server/mcp/public-origin";
import {
  requireAuthenticatedContext,
  requireProjectContext,
} from "@/serverFunctions/middleware";

const projectScopedSchema = z.object({ projectId: z.string().min(1) });
const setPropertySchema = projectScopedSchema.extend({
  accountId: z.string().min(1),
  propertyId: z.string().regex(/^properties\/\d+$/),
});
const startLinkSchema = z.object({
  callbackURL: z.string().min(1),
});

export const getGa4Connection = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    const [connection, currentUserHasGrant, googleOAuthConfigured] =
      await Promise.all([
        Ga4Service.getConnection(context.projectId),
        Ga4Service.userHasGrant(context.userId),
        hasGoogleOAuthConfig(),
      ]);
    const health = connection
      ? await probeAndRecordRefreshHealth({
          integration: "ga4",
          providerId: GA4_INTEGRATION.providerId,
          projectId: context.projectId,
          connectedByUserId: connection.connectedByUserId,
          accountId: connection.ga4AccountId,
        })
      : null;
    const storedHealth = await getStoredRefreshHealth({
      projectId: context.projectId,
      integration: "ga4",
    });
    const reconnectRequired = Boolean(connection && health && !health.healthy);
    return {
      connected: Boolean(connection) && !reconnectRequired,
      reconnectRequired,
      canManage: hasOrgPermission(context.role, { integration: ["manage"] }),
      currentUserHasGrant,
      googleOAuthConfigured,
      propertyId: connection?.propertyId ?? null,
      propertyDisplayName: connection?.propertyDisplayName ?? null,
      propertyTimeZone: connection?.propertyTimeZone ?? null,
      propertyCurrencyCode: connection?.propertyCurrencyCode ?? null,
      connectedByEmail: connection?.connectedAccountEmail ?? null,
      connectedAt: connection?.createdAt ?? null,
      lastSuccessfulRefreshAt: storedHealth?.lastSuccessfulRefreshAt ?? null,
      lastRefreshErrorAt: storedHealth?.lastRefreshErrorAt ?? null,
      lastRefreshErrorCode: storedHealth?.lastRefreshErrorCode ?? null,
    };
  });

function overviewMetric(
  row: Record<string, string | number | null> | null,
  name: string,
): number | null {
  const value = row?.[name];
  return typeof value === "number" ? value : null;
}

/** Zero-fill the daily trend across the resolved range: GA4 omits days with
 *  no organic sessions, which would silently shrink the chart's x-axis. */
function fillDailySessions(
  rows: Array<Record<string, string | number | null>>,
  range: { startDate: string; endDate: string },
): Array<{ date: string; sessions: number }> {
  const sessionsByDate = new Map<string, number>();
  for (const row of rows) {
    // GA4's `date` dimension is YYYYMMDD; the range dates are YYYY-MM-DD.
    if (typeof row.date !== "string" || typeof row.sessions !== "number") {
      continue;
    }
    const iso = `${row.date.slice(0, 4)}-${row.date.slice(4, 6)}-${row.date.slice(6, 8)}`;
    sessionsByDate.set(iso, row.sessions);
  }
  const days: Array<{ date: string; sessions: number }> = [];
  for (
    let date = range.startDate;
    date <= range.endDate;
    date = shiftGa4Date(date, 1)
  ) {
    days.push({ date, sessions: sessionsByDate.get(date) ?? 0 });
  }
  return days;
}

/** The dashboard's GA4 card: organic totals vs the previous period plus a
 *  daily sessions trend, over the default (last 28 complete days) range. */
export const getGa4DashboardReport = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    try {
      const overview = await Ga4OrganicOverviewService.getOrganicOverview({
        projectId: context.projectId,
      });
      const totals = (row: Record<string, string | number | null> | null) => ({
        sessions: overviewMetric(row, "sessions"),
        activeUsers: overviewMetric(row, "activeUsers"),
        engagementRate: overviewMetric(row, "engagementRate"),
        keyEvents: overviewMetric(row, "keyEvents"),
      });
      return {
        connected: true as const,
        totals: totals(overview.current),
        prevTotals: totals(overview.previous),
        trend: fillDailySessions(
          overview.trend,
          overview.request.resolvedDateRange,
        ),
      };
    } catch (error) {
      // Not connected, a dead grant, or a lost/deleted property: the dashboard
      // card falls back to the connect card instead of retrying a report that
      // can never succeed. Other report errors are real faults.
      if (
        error instanceof Ga4ReportError &&
        (error.code === "ga4_not_connected" ||
          error.code === "ga4_reconnect_required" ||
          error.code === "ga4_property_inaccessible")
      ) {
        return { connected: false as const };
      }
      // Google's per-property reporting quota is exhausted: an external,
      // transient condition, not an app fault. Surface it as RATE_LIMITED so
      // error tracking skips it — the card keeps its own "try again" copy.
      if (
        error instanceof Ga4ReportError &&
        error.code === "ga4_quota_exhausted"
      ) {
        throw new AppError("RATE_LIMITED");
      }
      throw error;
    }
  });

export const listGa4Properties = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    const [propertyList, connection] = await Promise.all([
      Ga4Service.listPropertiesForUserWithGrantStatus(context.userId),
      Ga4Service.getConnection(context.projectId),
    ]);
    return {
      accounts: propertyList.accounts.map((grant) => ({
        ...grant,
        properties: grant.properties.map((property) => ({
          ...property,
          isSelected:
            connection?.ga4AccountId === grant.accountId &&
            connection.propertyId === property.propertyId,
        })),
      })),
    };
  });

export const setGa4Property = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(setPropertySchema)
  .handler(async ({ data, context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    const connection = await Ga4Service.setProperty({
      projectId: context.projectId,
      organizationId: context.organizationId,
      accountId: data.accountId,
      propertyId: data.propertyId,
      userId: context.userId,
    });
    waitUntil(
      captureServerEvent({
        distinctId: context.userId,
        event: "ga4:property_select",
        organizationId: context.organizationId,
        properties: { project_id: context.projectId },
      }),
    );
    return {
      connected: true as const,
      propertyId: connection.propertyId,
      propertyDisplayName: connection.propertyDisplayName,
      propertyTimeZone: connection.propertyTimeZone,
      propertyCurrencyCode: connection.propertyCurrencyCode,
      connectedByEmail: connection.connectedAccountEmail,
      connectedAt: connection.createdAt,
    };
  });

export const disconnectGa4 = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    await Ga4Service.disconnect({ projectId: context.projectId });
    waitUntil(
      captureServerEvent({
        distinctId: context.userId,
        event: "ga4:disconnect",
        organizationId: context.organizationId,
        properties: { project_id: context.projectId },
      }),
    );
    return { connected: false as const };
  });

export const startGa4Link = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(startLinkSchema)
  .handler(async ({ data, context }) => ({
    url:
      (await getGoogleAccessMode()) === "gateway"
        ? await getGatewayGoogleConnectUrl(data.callbackURL)
        : await createGoogleAuthorizationUrl({
            integration: GA4_INTEGRATION,
            userId: context.userId,
            callbackURL: data.callbackURL,
            publicOrigin: getPublicOrigin(getRequest()),
          }),
  }));
