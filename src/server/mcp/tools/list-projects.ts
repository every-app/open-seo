import { ProjectService } from "@/server/features/projects/services/ProjectService";
import { mcpResponse } from "@/server/mcp/formatters";
import { type ToolContext } from "@/server/mcp/context";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { buildDashboardUrl } from "@/server/mcp/urls";
import { z } from "zod";

export const listProjectsTool = {
  name: "list_projects",
  config: {
    title: "List projects",
    description:
      "List the user's projects with their id, name, domain, and default market. Use it whenever another OpenSEO tool needs a projectId: pass the project's id. Tools fall back to the project's default market when a call omits location or language. Uses no credits. When there is no project yet, use create_project.",
    inputSchema: {} as Record<string, never>,
    outputSchema: z.looseObject({
      projects: z.array(
        z
          .object({
            id: z.string(),
            name: z.string(),
            domain: z.string().nullable().optional(),
            locationCode: z.number(),
            languageCode: z.string(),
            url: z.string(),
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
  handler: async (_args: Record<string, never>, context: ToolContext) => {
    const { baseUrl, organizationId } = context.auth;
    const projects = await ProjectService.listProjects(organizationId);
    const lines =
      projects.length === 0
        ? [
            "No projects yet. Ask the user for their website, then call create_project with its domain. Creating a project uses no credits.",
          ]
        : projects.map(
            (p) =>
              `- ${p.id}  ${p.name}${p.domain ? ` (${p.domain})` : ""}  market:${p.locationCode}/${p.languageCode}`,
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
        })),
      },
    });
  },
};
