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
import { AuthRepository } from "@/server/auth/repositories/AuthRepository";
import { resolveExistingActiveHostedOrganization } from "@/server/auth/default-hosted-organization";

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

const SURFMIND_CHROME_EXTENSION_HOSTNAME = "pghallcbnfabbgfijhbcldaapmgidnaa";
const SURFMIND_CHROME_EXTENSION_ORIGIN = `chrome-extension://${SURFMIND_CHROME_EXTENSION_HOSTNAME}`;

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

// Hosted applies exact-origin validation before passing the corresponding
// hostname allowlist to the SDK as defense in depth. Self-hosted leaves the
// option unset so the handler's localhost-class default applies — an allowlist
// derived from the request's own Host would accept a DNS-rebinding page
// trivially. Non-browser MCP clients send no Origin and are unaffected either
// way.
function createRequestHandler(
  props: McpProps,
  allowedOriginHostnames?: string[],
) {
  const modernHandler = createMcpHandler(() => createOpenSeoMcpServer(props), {
    route: MCP_ROUTE,
    allowedOriginHostnames,
    legacy: "reject",
    // MCP serving is strictly stateless: no notification is ever published,
    // so refuse subscriptions/listen outright (in-band -32603 before the
    // ack). The SSE streams it would otherwise hold open pin isolates for
    // hours and turn every isolate death into a burst of exceededMemory
    // request outcomes (EVE-95).
    maxSubscriptions: 0,
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

// Hosted credentials (OAuth grants and API keys) are user-scoped: the
// organizationId they carry is only the fallback context for tools with no
// project argument, so keep it while the membership holds, else rebind to the
// user's current active org. Null only when they belong to no org at all.
async function resolveRequestOrganization(
  userId: string,
  organizationId: string,
) {
  const membership = await AuthRepository.getMembership(userId, organizationId);
  if (membership) return { organizationId, role: membership.role };
  return resolveExistingActiveHostedOrganization(userId);
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

  const hostedUrl = new URL(getHostedBaseUrl());
  const origin = request.headers.get("Origin");
  if (
    origin &&
    origin !== hostedUrl.origin &&
    origin !== SURFMIND_CHROME_EXTENSION_ORIGIN
  ) {
    return withMcpCors(new Response("Invalid Origin", { status: 403 }));
  }

  // Tokens snapshot organizationId at consent and refresh copies it verbatim,
  // so the grant can outlive the membership (member removed, org changed).
  // Re-resolve per request; 401 invalid_token only once the user belongs to
  // no organization, pushing compliant clients back through OAuth.
  const authContext = result.data[MCP_AUTH_CONTEXT_PROP];
  const organization = await resolveRequestOrganization(
    authContext.userId,
    authContext.organizationId,
  );
  if (!organization) {
    return new Response("Organization access revoked", {
      status: 401,
      headers: { "WWW-Authenticate": 'Bearer error="invalid_token"' },
    });
  }

  // The handler would fall back to the provider-populated ctx.props on its
  // own; passing authContext explicitly hands it the schema-validated copy
  // (with the per-request role stamped in — roles are never baked into
  // tokens) and keeps this path symmetrical with self-hosted, which has no
  // ctx.props. orgScope is stamped here rather than read from the token so
  // grants minted before it existed are user-scoped too: project-scoped tools
  // authorize per call via membership in the project's org, so one
  // authorization follows the user across every organization they belong to.
  const requestProps = createWorkersOAuthMcpProps({
    ...authContext,
    organizationId: organization.organizationId,
    role: organization.role,
    orgScope: "user",
    // The only per-request client signal that reaches a tools/call: initialize's
    // clientInfo is long gone by then and this transport never populates
    // ServerContext.http.req. Display only (report attribution).
    userAgent: request.headers.get("user-agent") ?? undefined,
  });
  return createRequestHandler(requestProps, [
    hostedUrl.hostname,
    SURFMIND_CHROME_EXTENSION_HOSTNAME,
  ])(request, env, ctx);
}

/** Stands in for the OAuth client id the hosted flow would have issued. */
export const SELF_HOSTED_MCP_CLIENT_ID = "self-hosted";

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
    userAgent: request.headers.get("user-agent") ?? undefined,
    // Self-hosted has no OAuth flow, so nothing ever mints a real client id.
    // Activation reads that id to tell an external MCP client apart from a
    // first-party caller, and SAM reaches the tools in-process rather than
    // over this transport — so every request arriving here is external by
    // construction. Without a stand-in, "Connect your AI agent" stays
    // outstanding on the dashboard no matter how many tool calls succeed.
    clientId: SELF_HOSTED_MCP_CLIENT_ID,
  });

  return createRequestHandler(props)(request, env, ctx);
}
