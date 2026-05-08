import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProjectService } from "@/server/features/projects/services/ProjectService";
import { requireMcpToolAuthContext } from "@/server/mcp/context";

function jsonToolResult(data: Record<string, unknown>) {
  return {
    structuredContent: data,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

export function createOpenSeoMcpServer() {
  const server = new McpServer({
    name: "OpenSEO MCP",
    version: "0.0.10",
  });

  server.registerTool(
    "whoami",
    {
      title: "Who am I",
      description: "Return the verified OpenSEO user and organization context.",
    },
    async () => {
      const auth = requireMcpToolAuthContext();

      return jsonToolResult({
        userId: auth.userId,
        activeOrganizationId: auth.organizationId,
        account: {
          clientId: auth.clientId,
          scopes: auth.scopes,
          audience: auth.audience,
          subject: auth.subject,
        },
      });
    },
  );

  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description: "List projects in the verified OpenSEO organization.",
    },
    async () => {
      const auth = requireMcpToolAuthContext();
      const projects = await ProjectService.listProjects(auth.organizationId);

      return jsonToolResult({
        activeOrganizationId: auth.organizationId,
        projects,
      });
    },
  );

  return server;
}
