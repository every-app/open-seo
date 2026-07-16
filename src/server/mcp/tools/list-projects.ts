import { ProjectService } from "@/server/features/projects/services/ProjectService";
import { mcpResponse } from "@/server/mcp/formatters";
import {
  requireMcpToolAuthContext,
  type ToolExtra,
} from "@/server/mcp/context";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { buildDashboardUrl } from "@/server/mcp/urls";
import { z } from "zod";

export const listProjectsTool = {
  name: "list_projects",
  config: {
    title: "List projects",
    description:
      "Lists all projects in the user's organization. Uses no credits — does not call DataForSEO. Use this whenever you need a `projectId` for another OpenSEO tool. Returns an array of {id, name, domain, locationCode, languageCode}; pass the `id` value as `projectId`. locationCode/languageCode are the project's default market — tools fall back to them when a call omits location/language args.",
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
  handler: async (_args: Record<string, never>, extra: ToolExtra) => {
    const { baseUrl, ...auth } = requireMcpToolAuthContext(extra);
    const projects = await ProjectService.listProjects(auth.organizationId);
    const lines =
      projects.length === 0
        ? ["No projects yet. Create one in the dashboard."]
        : projects.map(
            (p) =>
              `- ${p.id}  ${p.name}${p.domain ? ` (${p.domain})` : ""}  market:${p.locationCode}/${p.languageCode}`,
          );
    return mcpResponse({
      text: `Projects (${projects.length}):\n${lines.join("\n")}`,
      meta: {
        organizationId: auth.organizationId,
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
