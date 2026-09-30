import { z } from "zod";
import { requireOrgPermission } from "@/server/auth/org-gate";
import { Ga4Service } from "@/server/features/ga4/services/Ga4Service";
import { AppError } from "@/server/lib/errors";
import { buildProjectMeta, type ToolContext } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import {
  optionalAccountIdSchema,
  OPTIONAL_PROJECT_ID,
} from "@/server/mcp/tools/google-connection-shared";

// MCP counterparts of the dashboard's "pick a Google Analytics property"
// screen. Wraps Ga4Service, which the server functions already use. Every list
// entry carries its accountId and the set tool accepts one back.

const ga4PropertyIdSchema = z
  .string()
  .trim()
  .regex(/^(properties\/)?\d+$/)
  .transform((value) =>
    value.startsWith("properties/") ? value : `properties/${value}`,
  )
  .describe(
    'GA4 property, as returned by list_google_analytics_properties ("properties/123456789") or the bare numeric id.',
  );

// ---------------------------------------------------------------------------
// list_google_analytics_properties
// ---------------------------------------------------------------------------

const listPropertiesInputSchema = {
  projectId: OPTIONAL_PROJECT_ID,
} as const;

type ListPropertiesArgs = z.infer<
  z.ZodObject<typeof listPropertiesInputSchema>
>;

async function listProperties(userId: string, projectId?: string) {
  const [propertyList, connection] = await Promise.all([
    Ga4Service.listPropertiesForUserWithGrantStatus(userId),
    projectId ? Ga4Service.getConnection(projectId) : Promise.resolve(null),
  ]);
  return propertyList.accounts.map((grant) => ({
    accountId: grant.accountId,
    email: grant.email,
    requiresReconnect: grant.requiresReconnect,
    propertiesUnavailable: grant.propertiesUnavailable,
    properties: grant.properties.map((property) => ({
      accountId: grant.accountId,
      propertyId: property.propertyId,
      displayName: property.displayName,
      accountDisplayName: property.accountDisplayName,
      ...(projectId
        ? {
            isSelected:
              connection?.ga4AccountId === grant.accountId &&
              connection.propertyId === property.propertyId,
          }
        : {}),
    })),
  }));
}

function propertyListText(
  accounts: Awaited<ReturnType<typeof listProperties>>,
): string {
  if (accounts.length === 0) {
    return "No Google account with Google Analytics access is connected to this OpenSEO user.";
  }
  return accounts
    .map((grant) => {
      const header = `- account ${grant.accountId}${grant.email ? ` (${grant.email})` : ""}${grant.requiresReconnect ? " — needs reconnect" : ""}${grant.propertiesUnavailable ? " — properties unavailable" : ""}`;
      const properties = grant.properties.map(
        (property) =>
          `    ${property.propertyId}  ${property.displayName} (${property.accountDisplayName})${property.isSelected ? "  [selected]" : ""}`,
      );
      return [header, ...properties].join("\n");
    })
    .join("\n");
}

export const listGoogleAnalyticsPropertiesTool = {
  name: "list_google_analytics_properties",
  config: {
    title: "List Google Analytics properties",
    description:
      "Lists the GA4 properties visible to each Google account connected to the calling user, with the accountId of the account that sees each one. Use it to find the propertyId and accountId to pass to set_google_analytics_property. Uses no credits. Read-only.",
    inputSchema: listPropertiesInputSchema,
    outputSchema: z.looseObject({
      ok: z.boolean(),
      accounts: z.array(
        z
          .object({
            accountId: z.string(),
            email: z.string().nullable(),
            requiresReconnect: z.boolean(),
            propertiesUnavailable: z.boolean(),
            properties: z.array(
              z
                .object({
                  accountId: z.string(),
                  propertyId: z.string(),
                  displayName: z.string(),
                  accountDisplayName: z.string(),
                  isSelected: z.boolean().optional(),
                })
                .passthrough(),
            ),
          })
          .passthrough(),
      ),
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: async (args: ListPropertiesArgs, toolContext: ToolContext) => {
    if (args.projectId) {
      const withProject = withMcpProjectAuth(
        async (projectArgs: { projectId: string }, context) => {
          const accounts = await listProperties(
            context.auth.userId,
            projectArgs.projectId,
          );
          return mcpResponse({
            text: propertyListText(accounts),
            meta: buildProjectMeta(context, projectArgs.projectId),
            structuredContent: { ok: true, accounts },
          });
        },
      );
      return withProject({ projectId: args.projectId }, toolContext);
    }
    const accounts = await listProperties(toolContext.auth.userId);
    return mcpResponse({
      text: propertyListText(accounts),
      structuredContent: { ok: true, accounts },
    });
  },
};

// ---------------------------------------------------------------------------
// set_google_analytics_property
// ---------------------------------------------------------------------------

const setPropertyInputSchema = {
  projectId: projectIdSchema,
  propertyId: ga4PropertyIdSchema,
  ga4AccountId: optionalAccountIdSchema,
} as const;

type SetPropertyArgs = z.infer<z.ZodObject<typeof setPropertyInputSchema>>;

async function resolveGa4AccountId(
  userId: string,
  propertyId: string,
  requested: string | undefined,
): Promise<string> {
  if (requested) return requested;
  const { accounts } =
    await Ga4Service.listPropertiesForUserWithGrantStatus(userId);
  const candidates = accounts.filter((grant) =>
    grant.properties.some((property) => property.propertyId === propertyId),
  );
  if (candidates.length === 1 && candidates[0]) return candidates[0].accountId;
  if (candidates.length === 0) {
    throw new AppError(
      "NOT_FOUND",
      "That Google Analytics property isn't available on any connected Google account. Call list_google_analytics_properties to see what is.",
    );
  }
  throw new AppError(
    "VALIDATION_ERROR",
    `Several connected Google accounts can see that property (${candidates.map((grant) => grant.accountId).join(", ")}). Retry with ga4AccountId set.`,
  );
}

export const setGoogleAnalyticsPropertyTool = {
  name: "set_google_analytics_property",
  config: {
    title: "Set project Google Analytics property",
    description:
      "Binds a project to a GA4 property, using the given connected Google account (ga4AccountId). The property must be visible to that account. Replaces any previous binding for the project, so calling it again with the same arguments is a no-op. Uses no credits. Requires permission to manage integrations.",
    inputSchema: setPropertyInputSchema,
    outputSchema: z.looseObject({
      ok: z.boolean(),
      connected: z.boolean(),
      projectId: z.string(),
      propertyId: z.string(),
      ga4AccountId: z.string(),
      propertyDisplayName: z.string().nullable().optional(),
      propertyTimeZone: z.string().nullable().optional(),
      propertyCurrencyCode: z.string().nullable().optional(),
      connectedByEmail: z.string().nullable(),
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: SetPropertyArgs, context) => {
    requireOrgPermission(context.auth, { integration: ["manage"] });
    const accountId = await resolveGa4AccountId(
      context.auth.userId,
      args.propertyId,
      args.ga4AccountId,
    );
    const connection = await Ga4Service.setProperty({
      projectId: args.projectId,
      organizationId: context.auth.organizationId,
      propertyId: args.propertyId,
      accountId,
      userId: context.auth.userId,
    });
    return mcpResponse({
      text: `Project ${args.projectId} is now bound to Google Analytics property ${connection.propertyId}${connection.propertyDisplayName ? ` (${connection.propertyDisplayName})` : ""} via Google account ${accountId}${connection.connectedAccountEmail ? ` (${connection.connectedAccountEmail})` : ""}.`,
      meta: buildProjectMeta(context, args.projectId),
      structuredContent: {
        ok: true,
        connected: true,
        projectId: args.projectId,
        propertyId: connection.propertyId,
        ga4AccountId: accountId,
        propertyDisplayName: connection.propertyDisplayName,
        propertyTimeZone: connection.propertyTimeZone,
        propertyCurrencyCode: connection.propertyCurrencyCode,
        connectedByEmail: connection.connectedAccountEmail,
      },
    });
  }),
};
