import { z } from "zod";
import { getAuth, getHostedBaseUrl } from "@/lib/auth";
import { API_KEY_PREFIX } from "@/lib/auth-api-key";
import { MCP_OAUTH_SCOPES } from "@/lib/oauth-resource";
import { AuthRepository } from "@/server/auth/repositories/AuthRepository";
import { recordMcpAuthorized } from "@/server/features/activation/mcpActivation";
import { createWorkersOAuthMcpProps, MCP_ROUTE } from "@/server/mcp/context";

// Stamped server-side at creation by the /api-key/create before hook in
// lib/auth.ts (and backfilled for older keys by migration), never by the
// client. The plugin stores it as JSON text and parses it on read.
const apiKeyMetadataSchema = z.looseObject({
  organizationId: z.string().min(1),
});

function getApiKey(request: Request) {
  // Both branches require the oseo_ prefix: anything else (a Cloudflare OAuth
  // access token, a stray foreign x-api-key header) falls through to the
  // OAuth provider instead of being consumed here.
  const headerKey = request.headers.get("x-api-key");
  if (headerKey?.startsWith(API_KEY_PREFIX)) return headerKey;

  const bearerToken = request.headers
    .get("Authorization")
    ?.replace(/^Bearer /i, "");
  if (bearerToken?.startsWith(API_KEY_PREFIX)) return bearerToken;

  return null;
}

function apiKeyErrorResponse(
  error: { code?: string | null; message?: unknown; details?: unknown } | null,
) {
  const headers = new Headers({ "Content-Type": "application/json" });

  const isLimited =
    error?.code === "RATE_LIMITED" || error?.code === "USAGE_EXCEEDED";
  const isForbidden = error?.code === "FORBIDDEN";
  if (isLimited) {
    // The plugin reports tryAgainIn (milliseconds) for RATE_LIMITED, but its
    // published error type omits `details`, so narrow at runtime.
    const details = error?.details;
    const tryAgainInMs =
      typeof details === "object" && details !== null && "tryAgainIn" in details
        ? details.tryAgainIn
        : undefined;
    if (typeof tryAgainInMs === "number" && Number.isFinite(tryAgainInMs)) {
      headers.set(
        "Retry-After",
        String(Math.max(1, Math.ceil(tryAgainInMs / 1000))),
      );
    }
  }

  const code = isLimited
    ? error?.code === "RATE_LIMITED"
      ? "rate_limited"
      : "usage_exceeded"
    : isForbidden
      ? "account_access_revoked"
      : "invalid_api_key";
  const description = isLimited
    ? typeof error?.message === "string"
      ? error.message
      : "API key request limit reached"
    : isForbidden
      ? typeof error?.message === "string"
        ? error.message
        : "This API key is no longer associated with an organization"
      : "The provided API key is invalid, expired, or disabled";
  const status = isLimited ? 429 : isForbidden ? 403 : 401;

  // Bad credentials are client-side noise, so 401 logs at debug (mirroring the
  // OAuth path); a 429 means we actually cut a caller off, so warn.
  const line = `[mcp-api-key] ${status} ${code} (${error?.code ?? "no_hosted_user"})`;
  if (status === 429) {
    console.warn(line);
  } else {
    console.debug(line);
  }

  return new Response(
    JSON.stringify({ error: code, error_description: description }),
    { status, headers },
  );
}

export async function handleMcpApiKeyRequest(
  request: Request,
  env: unknown,
  ctx: ExecutionContext,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== MCP_ROUTE || request.method === "OPTIONS") return null;

  const apiKey = getApiKey(request);
  if (!apiKey) return null;

  try {
    // Keep API keys scoped to /mcp: verifyApiKey (rather than Better Auth's
    // enableSessionForAPIKeys mock sessions) means a key never becomes a
    // session that could reach account or organization endpoints.
    const authApi = getAuth().api;
    const result = await authApi.verifyApiKey({ body: { key: apiKey } });

    if (!result.valid || !result.key) {
      return apiKeyErrorResponse(result.error);
    }

    const userId = result.key.referenceId;

    // Per-user request throttle. The binding is declared in deploy/alchemy/alchemy.run.ts
    // (hosted prod only); local dev and self-host run without it and skip
    // limiting, which is fine single-user. This replaces the better-auth
    // plugin limiter, whose broken idle-gap window hard-blocked active MCP
    // clients (see lib/auth-api-key.ts). Cloudflare's counter is per-colo
    // best-effort, which is all this needs to be: credits bound spend, this
    // bounds runaway request volume.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the binding is declared as a rate limiter in deploy/alchemy/alchemy.run.ts; absent outside hosted prod
    const rateLimit = (env as { MCP_RATE_LIMIT?: RateLimit }).MCP_RATE_LIMIT;
    if (rateLimit) {
      const { success } = await rateLimit.limit({ key: userId });
      if (!success) {
        return apiKeyErrorResponse({
          code: "RATE_LIMITED",
          message: "Rate limit exceeded: 5000 requests per minute",
          details: { tryAgainIn: 60_000 },
        });
      }
    }

    const user = await AuthRepository.getHostedUser(userId);
    if (!user?.email) return apiKeyErrorResponse(null);

    // A key is bound to the organization that was active when it was created
    // and bills that org. The member row is the authorization fact, re-read
    // per request so removing a member kills their keys immediately; the role
    // is never stored on the key. A key with no organization predates the
    // binding and was not backfilled, so it fails the same way rather than
    // being rebound to some other org.
    const organizationId = apiKeyMetadataSchema.safeParse(result.key.metadata)
      .data?.organizationId;
    const membership = organizationId
      ? await AuthRepository.getMembership(userId, organizationId)
      : null;
    if (!organizationId || !membership) {
      return apiKeyErrorResponse({
        code: "FORBIDDEN",
        message:
          "This API key's organization access was revoked. Create a new key in Settings.",
      });
    }

    // clientId "api_key" satisfies the hosted transport's fail-closed props
    // schema and counts these calls as external MCP clients in telemetry.
    const props = createWorkersOAuthMcpProps({
      userId,
      userEmail: user.email,
      organizationId,
      role: membership.role,
      baseUrl: getHostedBaseUrl(),
      scopes: [...MCP_OAUTH_SCOPES],
      clientId: "api_key",
    });

    await recordMcpAuthorized(organizationId);

    const { handleAuthenticatedOpenSeoMcpRequest } =
      await import("@/server/mcp/transport");
    return await handleAuthenticatedOpenSeoMcpRequest(request, props, env, ctx);
  } catch (error) {
    // Without this, a throw here surfaces as a bare platform 500 with no log
    // breadcrumb.
    console.error("[mcp-api-key] 500 (internal):", error);
    return new Response(
      JSON.stringify({
        error: "internal_error",
        error_description: "API key authentication failed",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
