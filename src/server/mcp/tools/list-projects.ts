import { ProjectService } from "@/server/features/projects/services/ProjectService";
import { mcpResponse } from "@/server/mcp/formatters";
import { getAuth, getBaseUrl, type ToolExtra } from "@/server/mcp/context";
import { buildDashboardUrl } from "@/server/mcp/urls";

export const listProjectsTool = {
  name: "list_projects",
  config: {
    title: "List projects",
    description:
      "Lists all projects in the user's organization. Free — does not call DataForSEO. Use this whenever you need a `projectId` for another OpenSEO tool. Returns an array of {id, name, domain}; pass the `id` value as `projectId`.",
    inputSchema: {} as Record<string, never>,
  },
  handler: async (_args: Record<string, never>, extra: ToolExtra) => {
    const auth = getAuth(extra);
    const baseUrl = getBaseUrl(extra);
    const projects = await ProjectService.listProjects(auth.organizationId);
    const lines =
      projects.length === 0
        ? ["No projects yet. Create one in the dashboard."]
        : projects.map(
            (p) => `- ${p.id}  ${p.name}${p.domain ? ` (${p.domain})` : ""}`,
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
          url: buildDashboardUrl(baseUrl, `/p/${p.id}`),
        })),
      },
    });
  },
};
