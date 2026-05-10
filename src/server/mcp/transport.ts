import { createMcpHandler } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getMcpResource, MCP_SCOPE } from "@/lib/oauth-resource";
import { resolveCloudflareAccessContext } from "@/middleware/ensure-user/cloudflareAccess";
import { resolveLocalNoAuthContext } from "@/middleware/ensure-user/delegated";
import {
  createWorkersOAuthMcpProps,
  MCP_AUTH_CONTEXT_PROP,
  MCP_ROUTE,
  runWithMcpToolAuthContext,
  workersOAuthMcpPropsSchema,
} from "@/server/mcp/context";
import { getPublicOrigin } from "@/server/mcp/public-origin";
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
  env: unknown,
  ctx: ExecutionContext,
): Promise<Response> {
  const result = workersOAuthMcpPropsSchema.safeParse(props);
  const scopes = result.success
    ? result.data[MCP_AUTH_CONTEXT_PROP].scopes
    : [];

  if (!result.success || !scopes.includes(MCP_SCOPE)) {
    return new Response("MCP auth context required", { status: 403 });
  }

  return handleOpenSeoMcpRequest(request, result.data, env, ctx);
}

export async function handleSelfHostedOpenSeoMcpRequest(
  request: Request,
  authMode: "cloudflare_access" | "local_noauth",
  env: unknown,
  ctx: ExecutionContext,
): Promise<Response> {
  // Self-hosted auth mirrors the app: local_noauth uses the local admin
  // workspace, while cloudflare_access trusts Cloudflare's Access JWT.
  // CORS/preflight still needs to reach the MCP transport before auth context
  // exists, so OPTIONS intentionally bypasses context creation.
  if (request.method === "OPTIONS") {
    return handleOpenSeoMcpRequest(request, undefined, env, ctx);
  }

  const baseUrl = getPublicOrigin(request);
  const context =
    authMode === "local_noauth"
      ? await resolveLocalNoAuthContext()
      : await resolveCloudflareAccessContext(request.headers);
  const props = createWorkersOAuthMcpProps({
    userId: context.userId,
    userEmail: context.userEmail,
    organizationId: context.organizationId,
    clientId: null,
    scopes: [],
    audience: getMcpResource(baseUrl),
    subject: context.userId,
    baseUrl,
  });

  return handleOpenSeoMcpRequest(request, props, env, ctx);
}

function handleOpenSeoMcpRequest(
  request: Request,
  props: ReturnType<typeof createWorkersOAuthMcpProps> | undefined,
  env: unknown,
  ctx: ExecutionContext,
): Promise<Response> {
  const server = createOpenSeoMcpServer();
  const handler = createMcpHandler(server, {
    route: MCP_ROUTE,
    enableJsonResponse: true,
    authContext: props ? { props } : undefined,
    corsOptions: {
      headers:
        "Authorization, Content-Type, Last-Event-ID, mcp-protocol-version, mcp-session-id",
      exposeHeaders: "mcp-protocol-version, mcp-session-id",
    },
  });

  if (!props) return handler(request, env, ctx);

  return runWithMcpToolAuthContext(props[MCP_AUTH_CONTEXT_PROP], () =>
    handler(request, env, ctx),
  );
}
