import { createMcpHandler } from "agents/mcp/server";
import { getHostedBaseUrl } from "@/lib/auth";
import { MCP_SCOPE } from "@/lib/oauth-resource";
import { resolveCloudflareAccessContext } from "@/middleware/ensure-user/cloudflareAccess";
import { resolveLocalNoAuthContext } from "@/middleware/ensure-user/delegated";
import {
  createWorkersOAuthMcpProps,
  hostedWorkersOAuthMcpPropsSchema,
  MCP_AUTH_CONTEXT_PROP,
  MCP_ROUTE,
} from "@/server/mcp/context";
import { getPublicOrigin } from "@/server/mcp/public-origin";
import { createOpenSeoMcpServer } from "@/server/mcp/server";

type McpProps = ReturnType<typeof createWorkersOAuthMcpProps>;

// Hosted pins browser Origins to the configured base URL. Self-hosted leaves
// the option unset so the handler's localhost-class default applies — an
// allowlist derived from the request's own Host would accept a DNS-rebinding
// page trivially. Non-browser MCP clients send no Origin and are unaffected
// either way.
function createRequestHandler(
  props: McpProps | undefined,
  allowedOriginHostnames?: string[],
) {
  return createMcpHandler(createOpenSeoMcpServer, {
    route: MCP_ROUTE,
    allowedOriginHostnames,
    authContext: props ? { props } : undefined,
  });
}

export async function handleAuthenticatedOpenSeoMcpRequest(
  request: Request,
  props: unknown,
  env: unknown,
  ctx: ExecutionContext,
): Promise<Response> {
  const result = hostedWorkersOAuthMcpPropsSchema.safeParse(props);
  if (!result.success) {
    return new Response("MCP auth context required", { status: 403 });
  }
  if (!result.data[MCP_AUTH_CONTEXT_PROP].scopes.includes(MCP_SCOPE)) {
    return new Response("MCP scope required", { status: 403 });
  }

  // The handler would fall back to the provider-populated ctx.props on its
  // own; passing authContext explicitly hands it the schema-validated copy and
  // keeps this path symmetrical with self-hosted, which has no ctx.props.
  return createRequestHandler(result.data, [
    new URL(getHostedBaseUrl()).hostname,
  ])(request, env, ctx);
}

export async function handleSelfHostedOpenSeoMcpRequest(
  request: Request,
  authMode: "cloudflare_access" | "local_noauth",
  env: unknown,
  ctx: ExecutionContext,
): Promise<Response> {
  // Preflight does not carry an authenticated application context.
  if (request.method === "OPTIONS") {
    return createRequestHandler(undefined)(request, env, ctx);
  }

  const identity =
    authMode === "local_noauth"
      ? await resolveLocalNoAuthContext()
      : await resolveCloudflareAccessContext(request.headers);
  const props = createWorkersOAuthMcpProps({
    userId: identity.userId,
    userEmail: identity.userEmail,
    organizationId: identity.organizationId,
    baseUrl: getPublicOrigin(request),
  });

  return createRequestHandler(props)(request, env, ctx);
}
