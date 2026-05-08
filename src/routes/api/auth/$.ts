import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { getAuth, getHostedBaseUrl, hasHostedAuthConfig } from "@/lib/auth";
import { isHostedAuthMode } from "@/lib/auth-mode";
import { getMcpResource } from "@/lib/oauth-resource";

const TOKEN_PATH = "/api/auth/oauth2/token";

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

  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: params.toString(),
  });
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
  return auth.handler(await maybeInjectMcpResource(request));
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
