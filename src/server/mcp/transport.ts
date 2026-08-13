import { createMcpHandler } from "agents/mcp/server";
import {
  hostHeaderValidationResponse,
  isLegacyRequest,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  originValidationResponse,
  WebStandardStreamableHTTPServerTransport,
} from "@modelcontextprotocol/server";
import { getHostedBaseUrl } from "@/lib/auth";
import { MCP_SCOPE } from "@/lib/oauth-resource";
import { resolveCloudflareAccessContext } from "@/middleware/ensure-user/cloudflareAccess";
import { resolveLocalNoAuthContext } from "@/middleware/ensure-user/delegated";
import {
  createWorkersOAuthMcpProps,
  hostedWorkersOAuthMcpPropsSchema,
  MCP_AUTH_CONTEXT_PROP,
  MCP_ROUTE,
  type McpProps,
} from "@/server/mcp/context";
import { getPublicOrigin } from "@/server/mcp/public-origin";
import { createOpenSeoMcpServer } from "@/server/mcp/server";

// Mirrors the agents SDK's DEFAULT_CORS_OPTIONS so legacy responses carry the
// same CORS surface as the modern handler's.
const MCP_CORS_HEADERS = {
  "Access-Control-Allow-Headers":
    "Content-Type, Accept, Authorization, mcp-session-id, MCP-Protocol-Version, Mcp-Method, Mcp-Name",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers": "mcp-session-id",
  "Access-Control-Max-Age": "86400",
} as const;

function withMcpCors(response: Response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(MCP_CORS_HEADERS)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// Port of the host/origin validation the agents SDK handler applies to the
// requests it serves; legacy requests bypass that handler, so it runs here.
function validateLegacyRequest(
  request: Request,
  allowedOriginHostnames?: string[],
) {
  const url = new URL(request.url);
  const isLocal = localhostAllowedHostnames().includes(url.hostname);
  const isWorkersDev = url.hostname.endsWith(".workers.dev");
  const acceptedHostnames = isLocal
    ? localhostAllowedHostnames()
    : isWorkersDev
      ? [url.hostname]
      : undefined;
  const hostRejection = acceptedHostnames
    ? hostHeaderValidationResponse(request, acceptedHostnames)
    : undefined;
  if (hostRejection) return withMcpCors(hostRejection);

  const acceptedOrigins =
    allowedOriginHostnames ??
    (isWorkersDev
      ? [...localhostAllowedOrigins(), url.hostname]
      : localhostAllowedOrigins());
  const originRejection = originValidationResponse(request, acceptedOrigins);
  return originRejection ? withMcpCors(originRejection) : undefined;
}

async function handleLegacyJsonRequest(request: Request, props: McpProps) {
  if (request.method !== "POST") {
    return withMcpCors(
      Response.json(
        {
          jsonrpc: "2.0",
          error: { code: -32000, message: "Method not allowed." },
          id: null,
        },
        { status: 405, headers: { Allow: "POST, OPTIONS" } },
      ),
    );
  }

  // The SDK's own legacy fallbacks (agents' compat lane, the MCP SDK's
  // legacyStatelessFallback) construct this transport without
  // enableJsonResponse, which answers with an SSE stream and retains the
  // per-request server plus a keepalive for the response lifetime. JSON mode
  // buffers the response and lets the finally below tear everything down
  // before the request completes. JSON mode silently drops server-to-client
  // requests (sampling/elicitation) and would hang the buffered response —
  // no OpenSEO tool issues them.
  const server = createOpenSeoMcpServer(props);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    return withMcpCors(await transport.handleRequest(request));
  } finally {
    await Promise.all([
      transport.close().catch(() => {}),
      server.close().catch(() => {}),
    ]);
  }
}

// Hosted pins browser Origins to the configured base URL. Self-hosted leaves
// the option unset so the handler's localhost-class default applies — an
// allowlist derived from the request's own Host would accept a DNS-rebinding
// page trivially. Non-browser MCP clients send no Origin and are unaffected
// either way.
function createRequestHandler(
  props: McpProps,
  allowedOriginHostnames?: string[],
) {
  const modernHandler = createMcpHandler(() => createOpenSeoMcpServer(props), {
    route: MCP_ROUTE,
    allowedOriginHostnames,
    legacy: "reject",
  });

  return async (request: Request, env: unknown, ctx: ExecutionContext) => {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: MCP_CORS_HEADERS });
    }
    if (new URL(request.url).pathname !== MCP_ROUTE) {
      return withMcpCors(new Response("Not Found", { status: 404 }));
    }
    if (!(await isLegacyRequest(request))) {
      return modernHandler(request, env, ctx);
    }

    const rejection = validateLegacyRequest(request, allowedOriginHostnames);
    return rejection ?? handleLegacyJsonRequest(request, props);
  };
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
    return new Response(null, { headers: MCP_CORS_HEADERS });
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
