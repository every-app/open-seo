import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { getAuth, getHostedBaseUrl, hasHostedAuthConfig } from "@/lib/auth";
import { isHostedAuthMode } from "@/lib/auth-mode";
import { getMcpResource } from "@/lib/oauth-resource";

const TOKEN_PATH = "/api/auth/oauth2/token";
const REGISTER_PATH = "/api/auth/oauth2/register";
const PUBLIC_CLIENT_AUTH_METHOD = "none";

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function hasRequestAuthContext(request: Request) {
  return Boolean(
    request.headers.get("authorization") || request.headers.get("cookie"),
  );
}

function requestWithReplacedBody(request: Request, body: BodyInit) {
  const headers = new Headers(request.headers);
  headers.delete("content-length");

  return new Request(request.url, {
    method: request.method,
    headers,
    body,
  });
}

// Inject RFC 8707 `resource` into /oauth2/token requests when the client
// omitted it. Some MCP clients (notably codex as of 2026-05) skip the
// resource indicator, which makes better-auth issue an opaque access token
// (see `checkResource` in @better-auth/oauth-provider — audience comes from
// `ctx.body.resource` at token-issuance time, not from the stored authorize
// query). Without an audience to bind, no `aud` claim → opaque token → no
// local JWT verify on the resource side.
//
// We only have one valid audience (`validAudiences: [mcpResource]` in
// auth-config.ts), so it is safe to default missing resources to it. Remove
// this shim once MCP clients reliably pass `resource` per spec.
export async function maybeInjectMcpResource(
  request: Request,
): Promise<Request> {
  if (request.method !== "POST") return request;

  const url = new URL(request.url);
  if (url.pathname !== TOKEN_PATH) return request;

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded"))
    return request;

  const body = await request.clone().text();
  const params = new URLSearchParams(body);
  if (params.has("resource")) return request;

  params.set("resource", getMcpResource(getHostedBaseUrl()));

  return requestWithReplacedBody(request, params.toString());
}

// Some hosted MCP clients attempt unauthenticated DCR while sending a
// confidential-client auth method. Better Auth only permits unauthenticated DCR
// for public clients, so normalize that case to the compatible public shape.
// Claude Desktop hit this path during connector setup: it had no session or
// registration bearer token, but sent a non-`none` token endpoint auth method.
export async function maybeDefaultMcpClientRegistrationAuthMethod(
  request: Request,
): Promise<Request> {
  if (request.method !== "POST") return request;

  const url = new URL(request.url);
  if (url.pathname !== REGISTER_PATH) return request;

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return request;

  let body: unknown;
  try {
    body = await request.clone().json();
  } catch {
    return request;
  }

  if (!isJsonObject(body)) return request;

  if (
    hasRequestAuthContext(request) ||
    body.token_endpoint_auth_method === PUBLIC_CLIENT_AUTH_METHOD
  ) {
    return request;
  }

  return requestWithReplacedBody(
    request,
    JSON.stringify({
      ...body,
      token_endpoint_auth_method: PUBLIC_CLIENT_AUTH_METHOD,
    }),
  );
}

async function handleAuthRequest(request: Request) {
  if (!isHostedAuthMode(env.AUTH_MODE)) {
    return new Response("Not found", {
      status: 404,
    });
  }

  if (!hasHostedAuthConfig()) {
    return new Response("Missing Better Auth hosted configuration", {
      status: 500,
    });
  }

  const auth = getAuth();
  const requestWithRegistrationDefaults =
    await maybeDefaultMcpClientRegistrationAuthMethod(request);
  const requestWithResource = await maybeInjectMcpResource(
    requestWithRegistrationDefaults,
  );
  return auth.handler(requestWithResource);
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        return handleAuthRequest(request);
      },
      POST: async ({ request }: { request: Request }) => {
        return handleAuthRequest(request);
      },
    },
  },
});
