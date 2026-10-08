import { z } from "zod";
import { requireOrgPermission } from "@/server/auth/org-gate";
import { GscService } from "@/server/features/gsc/services/GscService";
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

// MCP counterparts of the dashboard's "pick a Search Console property" screen.
// Wraps GscService, which the server functions already use, so the grant,
// permission, and verified-property checks are identical. A user can hold
// several Google grants; every list entry carries its accountId and the set
// tool accepts one back.

// ---------------------------------------------------------------------------
// list_search_console_sites
// ---------------------------------------------------------------------------

const listSitesInputSchema = {
  projectId: OPTIONAL_PROJECT_ID,
} as const;

type ListSitesArgs = z.infer<z.ZodObject<typeof listSitesInputSchema>>;

async function listSites(userId: string, projectId?: string) {
  const [siteList, connection] = await Promise.all([
    GscService.listSitesForUserWithGrantStatus(userId),
    projectId ? GscService.getConnection(projectId) : Promise.resolve(null),
  ]);
  return siteList.accounts.map((grant) => ({
    accountId: grant.accountId,
    email: grant.email,
    requiresReconnect: grant.requiresReconnect,
    propertiesUnavailable: grant.propertiesUnavailable,
    sites: grant.sites.map((site) => ({
      accountId: grant.accountId,
      siteUrl: site.siteUrl,
      permissionLevel: site.permissionLevel,
      selectable: site.permissionLevel !== "siteUnverifiedUser",
      ...(projectId
        ? {
            isSelected:
              connection?.gscAccountId === grant.accountId &&
              connection.siteUrl === site.siteUrl,
          }
        : {}),
    })),
  }));
}

function siteListText(accounts: Awaited<ReturnType<typeof listSites>>): string {
  if (accounts.length === 0) {
    return "No Google account with Search Console access is connected to this OpenSEO user.";
  }
  return accounts
    .map((grant) => {
      const header = `- account ${grant.accountId}${grant.email ? ` (${grant.email})` : ""}${grant.requiresReconnect ? " — needs reconnect" : ""}${grant.propertiesUnavailable ? " — properties unavailable" : ""}`;
      const sites = grant.sites.map(
        (site) =>
          `    ${site.siteUrl}  ${site.permissionLevel}${site.isSelected ? "  [selected]" : ""}`,
      );
      return [header, ...sites].join("\n");
    })
    .join("\n");
}

export const listSearchConsoleSitesTool = {
  name: "list_search_console_sites",
  config: {
    title: "List Search Console sites",
    description:
      "Lists the Search Console properties visible to each Google account connected to the calling user, with the accountId of the account that sees each one. Use it to find the siteUrl (e.g. sc-domain:example.com or https://www.example.com/) and accountId to pass to set_search_console_site. Uses no credits. Read-only.",
    inputSchema: listSitesInputSchema,
    outputSchema: z.looseObject({
      ok: z.boolean(),
      accounts: z.array(
        z
          .object({
            accountId: z.string(),
            email: z.string().nullable(),
            requiresReconnect: z.boolean(),
            propertiesUnavailable: z.boolean(),
            sites: z.array(
              z
                .object({
                  accountId: z.string(),
                  siteUrl: z.string(),
                  permissionLevel: z.string(),
                  selectable: z.boolean(),
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
  handler: async (args: ListSitesArgs, toolContext: ToolContext) => {
    if (args.projectId) {
      const withProject = withMcpProjectAuth(
        async (projectArgs: { projectId: string }, context) => {
          const accounts = await listSites(
            context.auth.userId,
            projectArgs.projectId,
          );
          return mcpResponse({
            text: siteListText(accounts),
            meta: buildProjectMeta(context, projectArgs.projectId),
            structuredContent: { ok: true, accounts },
          });
        },
      );
      return withProject({ projectId: args.projectId }, toolContext);
    }
    const accounts = await listSites(toolContext.auth.userId);
    return mcpResponse({
      text: siteListText(accounts),
      structuredContent: { ok: true, accounts },
    });
  },
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
  gscAccountId: optionalAccountIdSchema,
} as const;

type SetSiteArgs = z.infer<z.ZodObject<typeof setSiteInputSchema>>;

async function resolveGscAccountId(
  userId: string,
  siteUrl: string,
  requested: string | undefined,
): Promise<string> {
  if (requested) return requested;
  const { accounts } = await GscService.listSitesForUserWithGrantStatus(userId);
  const candidates = accounts.filter((grant) =>
    grant.sites.some((site) => site.siteUrl === siteUrl),
  );
  if (candidates.length === 1 && candidates[0]) return candidates[0].accountId;
  if (candidates.length === 0) {
    throw new AppError(
      "NOT_FOUND",
      "That Search Console property isn't available on any connected Google account. Call list_search_console_sites to see what is.",
    );
  }
  throw new AppError(
    "VALIDATION_ERROR",
    `Several connected Google accounts can see that property (${candidates.map((grant) => grant.accountId).join(", ")}). Retry with gscAccountId set.`,
  );
}

export const setSearchConsoleSiteTool = {
  name: "set_search_console_site",
  config: {
    title: "Set project Search Console site",
    description:
      "Binds a project to a verified Search Console property, using the given connected Google account (gscAccountId). The property must be visible to that account with verified access. Replaces any previous binding for the project, so calling it again with the same arguments is a no-op. Uses no credits. Requires permission to manage integrations.",
    inputSchema: setSiteInputSchema,
    outputSchema: z.looseObject({
      ok: z.boolean(),
      connected: z.boolean(),
      projectId: z.string(),
      siteUrl: z.string(),
      gscAccountId: z.string(),
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
  handler: withMcpProjectAuth(async (args: SetSiteArgs, context) => {
    requireOrgPermission(context.auth, { integration: ["manage"] });
    const accountId = await resolveGscAccountId(
      context.auth.userId,
      args.siteUrl,
      args.gscAccountId,
    );
    const connection = await GscService.setSite({
      projectId: args.projectId,
      organizationId: context.auth.organizationId,
      siteUrl: args.siteUrl,
      accountId,
      userId: context.auth.userId,
    });
    return mcpResponse({
      text: `Project ${args.projectId} is now bound to Search Console property ${connection.siteUrl} via Google account ${accountId}${connection.connectedAccountEmail ? ` (${connection.connectedAccountEmail})` : ""}.`,
      meta: buildProjectMeta(context, args.projectId),
      structuredContent: {
        ok: true,
        connected: true,
        projectId: args.projectId,
        siteUrl: connection.siteUrl,
        gscAccountId: accountId,
        connectedByEmail: connection.connectedAccountEmail,
      },
    });
  }),
};
