import { AuthRepository } from "@/server/auth/repositories/AuthRepository";
import { ProjectService } from "@/server/features/projects/services/ProjectService";
import { mcpResponse } from "@/server/mcp/formatters";
import { type ToolContext } from "@/server/mcp/context";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { buildDashboardUrl } from "@/server/mcp/urls";
import { z } from "zod";

// The org(s) whose projects the caller can see. Pinned credentials (OAuth
// tokens, self-host) see the bound org; user-scoped credentials (API keys)
// see every organization the user belongs to, labeled so the agent can tell
// same-named projects apart.
async function listVisibleProjects(auth: Omit<ToolContext["auth"], "baseUrl">) {
  if (auth.orgScope !== "user") {
    const projects = await ProjectService.listProjects(auth.organizationId);
    return projects.map((project) => ({
      ...project,
      organization: undefined,
      organizationId: undefined,
    }));
  }

  const memberships = await AuthRepository.listMembershipsForUser(auth.userId);
  const byOrg = await Promise.all(
    memberships.map(async (membership) => {
      const projects = await ProjectService.listProjects(
        membership.organizationId,
      );
      return projects.map((project) => ({
        ...project,
        organization: membership.organizationName,
        organizationId: membership.organizationId,
      }));
    }),
  );
  return byOrg.flat();
}

export const listProjectsTool = {
  name: "list_projects",
  config: {
    title: "List projects",
    description:
      "Lists the user's projects. Uses no credits — does not call DataForSEO. Use this whenever you need a `projectId` for another OpenSEO tool. Returns an array of {id, name, domain, locationCode, languageCode}; pass the `id` value as `projectId`. locationCode/languageCode are the project's default market — tools fall back to them when a call omits location/language args. When the user belongs to several organizations, each project is labeled with its organization and organizationId (pass that to create_project).",
    inputSchema: {} as Record<string, never>,
    outputSchema: {
      projects: z.array(
        z
          .object({
            id: z.string(),
            name: z.string(),
            domain: z.string().nullable().optional(),
            locationCode: z.number(),
            languageCode: z.string(),
            url: z.string(),
            organization: z.string().optional(),
            organizationId: z.string().optional(),
          })
          .passthrough(),
      ),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: async (_args: Record<string, never>, context: ToolContext) => {
    const { baseUrl, ...auth } = context.auth;
    const projects = await listVisibleProjects(auth);
    const lines =
      projects.length === 0
        ? ["No projects yet. Create one in the dashboard."]
        : projects.map(
            (p) =>
              `- ${p.id}  ${p.name}${p.domain ? ` (${p.domain})` : ""}${p.organization ? `  organization:${p.organization} [${p.organizationId}]` : ""}  market:${p.locationCode}/${p.languageCode}`,
          );
    return mcpResponse({
      text: `Projects (${projects.length}):\n${lines.join("\n")}`,
      meta: {
        url: buildDashboardUrl(baseUrl, "/"),
      },
      structuredContent: {
        projects: projects.map((p) => ({
          id: p.id,
          name: p.name,
          domain: p.domain,
          locationCode: p.locationCode,
          languageCode: p.languageCode,
          url: buildDashboardUrl(baseUrl, `/p/${p.id}`),
          ...(p.organization ? { organization: p.organization } : {}),
          ...(p.organizationId ? { organizationId: p.organizationId } : {}),
        })),
      },
    });
  },
};
