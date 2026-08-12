import { getHostedBaseUrl } from "@/lib/auth";
import { MCP_OAUTH_SCOPES } from "@/lib/oauth-resource";
import { createWorkersOAuthMcpProps, MCP_ROUTE } from "@/server/mcp/context";
import { handleAuthenticatedOpenSeoMcpRequest } from "@/server/mcp/transport";
import { asAppError } from "@/server/lib/errors";
import {
  getSessionTokenHeader,
  resolveAgentContext,
} from "@/server/agentonboard/agentonboard";

// The AgentOnboard entry point into the MCP server, mirroring the API-key auth
// path (handleMcpApiKeyRequest): verify the agent's session token, synthesize
// the same MCP auth props, and let the hosted transport serve the request.
// Returns null when the request is not an AO agent request (no x-session-token
// header) so the caller can fall through to the normal OAuth path unchanged.
export async function handleAgentOnboardMcpRequest(
  request: Request,
  env: unknown,
  ctx: ExecutionContext,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== MCP_ROUTE || request.method === "OPTIONS") {
    return null;
  }

  if (!request.headers.get(getSessionTokenHeader())) {
    return null;
  }

  let identity;
  try {
    identity = await resolveAgentContext(request.headers);
  } catch (error) {
    return agentErrorResponse(error);
  }

  if (!identity) {
    return null;
  }

  // The agent acts as the matched user. A distinct clientId marks these calls
  // as AgentOnboard agents (vs OAuth clients / api_key) and satisfies the
  // hosted transport's fail-closed props schema.
  const props = createWorkersOAuthMcpProps({
    userId: identity.userId,
    userEmail: identity.userEmail,
    organizationId: identity.organizationId,
    baseUrl: getHostedBaseUrl(),
    scopes: [...MCP_OAUTH_SCOPES],
    clientId: "agent_onboard",
  });

  return handleAuthenticatedOpenSeoMcpRequest(request, props, env, ctx);
}

// Surface a rejected agent request as a JSON-RPC error (the MCP protocol's
// error shape) rather than letting the AppError throw up to the caller, which
// would surface as an opaque HTTP 500 instead of the message the agent can act
// on. A UNAUTHENTICATED failure (no matching account / unverified email) is
// the agent-visible case; everything else is a server-side problem we log.
function agentErrorResponse(error: unknown): Response {
  const appError = asAppError(error);
  if (appError?.code === "UNAUTHENTICATED") {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32001,
          message: appError.message,
        },
      }),
      {
        status: 401,
        headers: { "content-type": "application/json" },
      },
    );
  }

  console.error("AgentOnboard request failed:", error);
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32603,
        message: "Internal error",
      },
    }),
    {
      status: 500,
      headers: { "content-type": "application/json" },
    },
  );
}
