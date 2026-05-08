import { createMcpHandler } from "agents/mcp";
import { verifyJwsAccessToken } from "better-auth/oauth2";
import type { JWTPayload } from "jose";
import { getAuth, getHostedBaseUrl, hasHostedAuthConfig } from "@/lib/auth";
import { isHostedAuthMode } from "@/lib/auth-mode";
import {
  getMcpOrganizationIdClaim,
  getMcpProtectedResourceMetadataUrl,
  getMcpResource,
  MCP_SCOPE,
} from "@/lib/oauth-resource";
import { MCP_AUTH_CONTEXT_PROP } from "@/server/mcp/context";
import { createOpenSeoMcpServer } from "@/server/mcp/server";
import { getMcpUserEmail } from "@/server/mcp/user-email";

// MCP request flow:
//   1. Resource (`resource=<mcp>`) is injected into /oauth2/token requests by
//      `routes/api/auth/$.ts` so Better Auth always issues audience-bound JWTs
//      (some MCP clients skip RFC 8707; without it tokens would be opaque).
//   2. Here we verify the JWT in-process via `verifyJwsAccessToken`, reading
//      the JWKS through `auth.api.getJwks()` rather than HTTP self-fetching
//      `/api/auth/jwks` (which 500s under workerd dev's self-routing and is
//      pointless in prod since the auth server and resource server are the
//      same Worker).
//   3. We expect `iss = baseURL + basePath` (basePath defaults to `/api/auth`)
//      and `aud = mcpResource`, both confirmed against the published
//      /.well-known/oauth-authorization-server metadata.
export const MCP_ROUTE = "/mcp";

type McpAccessTokenPayload = JWTPayload & {
  azp?: unknown;
  client_id?: unknown;
  scope?: unknown;
};

function getTokenScopes(payload: McpAccessTokenPayload) {
  return typeof payload.scope === "string"
    ? payload.scope.split(/\s+/).filter(Boolean)
    : [];
}

function getStringClaim(payload: Record<string, unknown>, claim: string) {
  const value = payload[claim];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function unauthorizedResponse(resource: string) {
  return new Response("Unauthorized", {
    status: 401,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": "WWW-Authenticate",
      "WWW-Authenticate": `Bearer resource_metadata="${getMcpProtectedResourceMetadataUrl(
        resource,
      )}"`,
    },
  });
}

export async function handleMcpRequest(
  request: Request,
  env: { AUTH_MODE?: unknown },
  ctx: ExecutionContext,
) {
  const authMode =
    typeof env.AUTH_MODE === "string" ? env.AUTH_MODE : undefined;

  if (!isHostedAuthMode(authMode)) {
    return new Response("Not found", { status: 404 });
  }

  if (!hasHostedAuthConfig()) {
    return new Response("Missing Better Auth hosted configuration", {
      status: 500,
    });
  }

  const baseUrl = getHostedBaseUrl();
  const auth = getAuth();
  const mcpResource = getMcpResource(baseUrl);
  const issuer = `${baseUrl}/api/auth`;
  const organizationIdClaim = getMcpOrganizationIdClaim(baseUrl);
  const server = createOpenSeoMcpServer();

  if (request.method === "OPTIONS") {
    return createMcpHandler(server, {
      route: MCP_ROUTE,
      enableJsonResponse: true,
    })(request, env, ctx);
  }

  const accessToken =
    request.headers
      .get("Authorization")
      ?.replace(/^Bearer\s+/i, "")
      .trim() || undefined;

  let payload: McpAccessTokenPayload;
  try {
    if (!accessToken) throw new Error("missing access token");
    payload = await verifyJwsAccessToken(accessToken, {
      jwksFetch: () => auth.api.getJwks(),
      verifyOptions: { audience: mcpResource, issuer },
    });
  } catch {
    return unauthorizedResponse(mcpResource);
  }

  const scopes = getTokenScopes(payload);
  if (!scopes.includes(MCP_SCOPE)) {
    return unauthorizedResponse(mcpResource);
  }

  const userId = getStringClaim(payload, "sub");
  const organizationId = getStringClaim(payload, organizationIdClaim);
  const clientId =
    getStringClaim(payload, "azp") ?? getStringClaim(payload, "client_id");

  if (!userId || !organizationId) {
    return new Response(
      userId
        ? "MCP organization context required"
        : "MCP user context required",
      {
        status: 403,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Expose-Headers": "WWW-Authenticate",
        },
      },
    );
  }

  const userEmail = await getMcpUserEmail(userId);
  if (!userEmail) {
    return new Response("MCP user context required", {
      status: 403,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "WWW-Authenticate",
      },
    });
  }

  return createMcpHandler(server, {
    route: MCP_ROUTE,
    enableJsonResponse: true,
    authContext: {
      props: {
        [MCP_AUTH_CONTEXT_PROP]: {
          userId,
          userEmail,
          organizationId,
          clientId,
          scopes,
          audience: mcpResource,
          subject: userId,
          baseUrl,
        },
      },
    },
  })(request, env, ctx);
}
