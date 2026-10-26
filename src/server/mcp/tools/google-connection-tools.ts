import { waitUntil } from "cloudflare:workers";
import { z } from "zod";
import { requireOrgPermission } from "@/server/auth/org-gate";
import { markOnboardingMilestone } from "@/server/email/onboarding-drip";
import { Ga4Service } from "@/server/features/ga4/services/Ga4Service";
import { GscService } from "@/server/features/gsc/services/GscService";
import { captureServerEvent } from "@/server/lib/posthog";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";

// MCP counterparts of the dashboard's "pick a Search Console property / GA4
// property" screens, so an agent can finish project setup after the user has
// connected Google in the dashboard. Everything goes through GscService and
// Ga4Service, the same code the listGscSites / setGscSite / listGa4Properties /
// setGa4Property server functions call, so the grant, verified-property and
// integration:manage checks are identical. No OAuth happens over MCP.
//
// A user can hold several Google grants, so the list tools group entries by
// account and the set tools take that accountId back.

const accountIdSchema = z
  .string()
  .trim()
  .min(1)
  .describe("accountId of the connected Google account from the list tool.");

const grantOutputShape = {
  accountId: z.string(),
  email: z.string().nullable(),
  requiresReconnect: z.boolean(),
  propertiesUnavailable: z.boolean(),
} as const;

// Both list and set call Google (site/property discovery and verification).
const listAnnotations = {
  readOnlyHint: true,
  openWorldHint: true,
  destructiveHint: false,
} as const;

const setAnnotations = {
  readOnlyHint: false,
  idempotentHint: true,
  openWorldHint: true,
  destructiveHint: false,
} as const;

function grantHeader(grant: {
  accountId: string;
  email: string | null;
  requiresReconnect: boolean;
  propertiesUnavailable: boolean;
}): string {
  return (
    `- account ${grant.accountId}` +
    (grant.email ? ` (${grant.email})` : "") +
    (grant.requiresReconnect ? " — needs reconnect" : "") +
    (grant.propertiesUnavailable ? " — properties unavailable" : "")
  );
}

// ---------------------------------------------------------------------------
// list_search_console_sites
// ---------------------------------------------------------------------------

export const listSearchConsoleSitesTool = {
  name: "list_search_console_sites",
  config: {
    title: "List Search Console sites",
    description:
      "Lists the Search Console properties visible to each Google account the calling user has connected in the OpenSEO dashboard, and flags the one bound to the project. Use it to find the siteUrl (e.g. sc-domain:example.com or https://www.example.com/) and accountId to pass to set_search_console_site. Cannot connect a new Google account; that happens on the project's Integrations page. Uses no credits. Read-only.",
    inputSchema: { projectId: projectIdSchema } as const,
    outputSchema: z.looseObject({
      ok: z.boolean(),
      accounts: z.array(
        z.looseObject({
          ...grantOutputShape,
          apiDisabled: z.boolean(),
          sites: z.array(
            z.looseObject({
              siteUrl: z.string(),
              permissionLevel: z.string(),
              isSelected: z.boolean(),
            }),
          ),
        }),
      ),
      ...optionalMetaOutputSchema,
    }),
    annotations: listAnnotations,
  },
  handler: withMcpProjectAuth(async (args: { projectId: string }, context) => {
    const [siteList, connection] = await Promise.all([
      GscService.listSitesForUserWithGrantStatus(context.auth.userId),
      GscService.getConnection(args.projectId),
    ]);
    const accounts = siteList.accounts.map((grant) => ({
      ...grant,
      sites: grant.sites.map((site) => ({
        siteUrl: site.siteUrl,
        permissionLevel: site.permissionLevel,
        // Connections made before accounts were recorded have no
        // gscAccountId; match them on the site alone.
        isSelected:
          connection?.siteUrl === site.siteUrl &&
          (connection.gscAccountId ?? grant.accountId) === grant.accountId,
      })),
    }));
    const text =
      accounts.length === 0
        ? "No Google account with Search Console access is connected to this OpenSEO user. Connect one on the project's Integrations page in the dashboard."
        : accounts
            .map((grant) =>
              [
                grantHeader(grant),
                ...grant.sites.map(
                  (site) =>
                    `    ${site.siteUrl}  ${site.permissionLevel}${site.isSelected ? "  [selected]" : ""}`,
                ),
              ].join("\n"),
            )
            .join("\n");
    return mcpResponse({
      text,
      meta: buildProjectMeta(context, args.projectId),
      structuredContent: { ok: true, accounts },
    });
  }),
};

// ---------------------------------------------------------------------------
// set_search_console_site
// ---------------------------------------------------------------------------

const setSiteInputSchema = {
  projectId: projectIdSchema,
  siteUrl: z
    .string()
    .trim()
    .min(1)
    .describe(
      "Search Console property exactly as list_search_console_sites returns it (e.g. sc-domain:example.com or https://www.example.com/).",
    ),
  gscAccountId: accountIdSchema,
} as const;

type SetSiteArgs = z.infer<z.ZodObject<typeof setSiteInputSchema>>;

export const setSearchConsoleSiteTool = {
  name: "set_search_console_site",
  config: {
    title: "Set project Search Console site",
    description:
      "Binds a project to a verified Search Console property through a Google account the user already connected in the OpenSEO dashboard (gscAccountId from list_search_console_sites). The property must be visible to that account with verified access. Replaces the project's previous binding. Uses no credits. Requires permission to manage integrations.",
    inputSchema: setSiteInputSchema,
    outputSchema: z.looseObject({
      ok: z.boolean(),
      projectId: z.string(),
      siteUrl: z.string(),
      gscAccountId: z.string(),
      connectedByEmail: z.string().nullable(),
      ...optionalMetaOutputSchema,
    }),
    annotations: setAnnotations,
  },
  handler: withMcpProjectAuth(async (args: SetSiteArgs, context) => {
    requireOrgPermission(context.auth, { integration: ["manage"] });
    const connection = await GscService.setSite({
      projectId: args.projectId,
      organizationId: context.auth.organizationId,
      siteUrl: args.siteUrl,
      accountId: args.gscAccountId,
      userId: context.auth.userId,
    });
    // Same activation signals as the dashboard's setGscSite.
    await markOnboardingMilestone(context.auth, "gscConnected");
    waitUntil(
      captureServerEvent({
        distinctId: context.auth.userId,
        event: "gsc:property_select",
        organizationId: context.auth.organizationId,
        properties: { project_id: args.projectId, source: "mcp" },
      }),
    );
    return mcpResponse({
      text: `Project ${args.projectId} is now bound to Search Console property ${connection.siteUrl} via Google account ${args.gscAccountId}${connection.connectedAccountEmail ? ` (${connection.connectedAccountEmail})` : ""}.`,
      meta: buildProjectMeta(context, args.projectId),
      structuredContent: {
        ok: true,
        projectId: args.projectId,
        siteUrl: connection.siteUrl,
        gscAccountId: args.gscAccountId,
        connectedByEmail: connection.connectedAccountEmail,
      },
    });
  }),
};

// ---------------------------------------------------------------------------
// list_google_analytics_properties
// ---------------------------------------------------------------------------

export const listGoogleAnalyticsPropertiesTool = {
  name: "list_google_analytics_properties",
  config: {
    title: "List Google Analytics properties",
    description:
      "Lists the GA4 properties visible to each Google account the calling user has connected in the OpenSEO dashboard, and flags the one bound to the project. Use it to find the propertyId and accountId to pass to set_google_analytics_property. Cannot connect a new Google account; that happens on the project's Integrations page. Uses no credits. Read-only.",
    inputSchema: { projectId: projectIdSchema } as const,
    outputSchema: z.looseObject({
      ok: z.boolean(),
      accounts: z.array(
        z.looseObject({
          ...grantOutputShape,
          properties: z.array(
            z.looseObject({
              propertyId: z.string(),
              displayName: z.string(),
              accountDisplayName: z.string(),
              isSelected: z.boolean(),
            }),
          ),
        }),
      ),
      ...optionalMetaOutputSchema,
    }),
    annotations: listAnnotations,
  },
  handler: withMcpProjectAuth(async (args: { projectId: string }, context) => {
    const [propertyList, connection] = await Promise.all([
      Ga4Service.listPropertiesForUserWithGrantStatus(context.auth.userId),
      Ga4Service.getConnection(args.projectId),
    ]);
    const accounts = propertyList.accounts.map((grant) => ({
      ...grant,
      properties: grant.properties.map((property) => ({
        ...property,
        isSelected:
          connection?.ga4AccountId === grant.accountId &&
          connection.propertyId === property.propertyId,
      })),
    }));
    const text =
      accounts.length === 0
        ? "No Google account with Google Analytics access is connected to this OpenSEO user. Connect one on the project's Integrations page in the dashboard."
        : accounts
            .map((grant) =>
              [
                grantHeader(grant),
                ...grant.properties.map(
                  (property) =>
                    `    ${property.propertyId}  ${property.displayName} (${property.accountDisplayName})${property.isSelected ? "  [selected]" : ""}`,
                ),
              ].join("\n"),
            )
            .join("\n");
    return mcpResponse({
      text,
      meta: buildProjectMeta(context, args.projectId),
      structuredContent: { ok: true, accounts },
    });
  }),
};

// ---------------------------------------------------------------------------
// set_google_analytics_property
// ---------------------------------------------------------------------------

const setPropertyInputSchema = {
  projectId: projectIdSchema,
  propertyId: z
    .string()
    .trim()
    .min(1)
    .describe(
      'GA4 property exactly as list_google_analytics_properties returns it (e.g. "properties/123456789").',
    ),
  ga4AccountId: accountIdSchema,
} as const;

type SetPropertyArgs = z.infer<z.ZodObject<typeof setPropertyInputSchema>>;

export const setGoogleAnalyticsPropertyTool = {
  name: "set_google_analytics_property",
  config: {
    title: "Set project Google Analytics property",
    description:
      "Binds a project to a GA4 property through a Google account the user already connected in the OpenSEO dashboard (ga4AccountId from list_google_analytics_properties). The property must be visible to that account. Replaces the project's previous binding. Uses no credits. Requires permission to manage integrations.",
    inputSchema: setPropertyInputSchema,
    outputSchema: z.looseObject({
      ok: z.boolean(),
      projectId: z.string(),
      propertyId: z.string(),
      ga4AccountId: z.string(),
      propertyDisplayName: z.string().nullable(),
      connectedByEmail: z.string().nullable(),
      ...optionalMetaOutputSchema,
    }),
    annotations: setAnnotations,
  },
  handler: withMcpProjectAuth(async (args: SetPropertyArgs, context) => {
    requireOrgPermission(context.auth, { integration: ["manage"] });
    const connection = await Ga4Service.setProperty({
      projectId: args.projectId,
      organizationId: context.auth.organizationId,
      propertyId: args.propertyId,
      accountId: args.ga4AccountId,
      userId: context.auth.userId,
    });
    waitUntil(
      captureServerEvent({
        distinctId: context.auth.userId,
        event: "ga4:property_select",
        organizationId: context.auth.organizationId,
        properties: { project_id: args.projectId, source: "mcp" },
      }),
    );
    return mcpResponse({
      text: `Project ${args.projectId} is now bound to Google Analytics property ${connection.propertyId}${connection.propertyDisplayName ? ` (${connection.propertyDisplayName})` : ""} via Google account ${args.ga4AccountId}${connection.connectedAccountEmail ? ` (${connection.connectedAccountEmail})` : ""}.`,
      meta: buildProjectMeta(context, args.projectId),
      structuredContent: {
        ok: true,
        projectId: args.projectId,
        propertyId: connection.propertyId,
        ga4AccountId: args.ga4AccountId,
        propertyDisplayName: connection.propertyDisplayName,
        connectedByEmail: connection.connectedAccountEmail,
      },
    });
  }),
};
