import { createMcpHandler } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MCP_SCOPE } from "@/lib/oauth-resource";
import {
  MCP_AUTH_CONTEXT_PROP,
  MCP_ROUTE,
  runWithMcpToolAuthContext,
  workersOAuthMcpPropsSchema,
} from "@/server/mcp/context";
import { registerOpenSeoMcpTools } from "@/server/mcp/server";

function createOpenSeoMcpServer() {
  const server = new McpServer({
    name: "OpenSEO MCP",
    version: "0.0.10",
  });
  registerOpenSeoMcpTools(server);

  return server;
}

export async function handleAuthenticatedOpenSeoMcpRequest(
  request: Request,
  props: unknown,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const result = workersOAuthMcpPropsSchema.safeParse(props);
  const scopes = result.success
    ? result.data[MCP_AUTH_CONTEXT_PROP].scopes
    : [];

  if (!result.success || !scopes.includes(MCP_SCOPE)) {
    return new Response("MCP auth context required", { status: 403 });
  }

  const server = createOpenSeoMcpServer();
  const handler = createMcpHandler(server, {
    route: MCP_ROUTE,
    enableJsonResponse: true,
    authContext: { props: result.data },
    corsOptions: {
      headers:
        "Authorization, Content-Type, Last-Event-ID, mcp-protocol-version, mcp-session-id",
      exposeHeaders: "mcp-protocol-version, mcp-session-id",
    },
  });

  return runWithMcpToolAuthContext(result.data[MCP_AUTH_CONTEXT_PROP], () =>
    handler(request, env, ctx),
  );
}
