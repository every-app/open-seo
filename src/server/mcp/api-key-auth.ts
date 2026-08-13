import { getAuth, getHostedBaseUrl } from "@/lib/auth";
import { API_KEY_PREFIX } from "@/lib/auth-api-key";
import { MCP_OAUTH_SCOPES } from "@/lib/oauth-resource";
import { getOrCreateDefaultHostedOrganization } from "@/server/auth/default-hosted-organization";
import { AuthRepository } from "@/server/auth/repositories/AuthRepository";
import { recordMcpAuthorized } from "@/server/features/activation/mcpActivation";
import { createWorkersOAuthMcpProps, MCP_ROUTE } from "@/server/mcp/context";
import { handleAuthenticatedOpenSeoMcpRequest } from "@/server/mcp/transport";

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
    : "invalid_api_key";
  const description = isLimited
    ? typeof error?.message === "string"
      ? error.message
      : "API key request limit reached"
    : "The provided API key is invalid, expired, or disabled";
  const status = isLimited ? 429 : 401;

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
    const user = await AuthRepository.getHostedUser(userId);
    if (!user?.email) return apiKeyErrorResponse(null);

    // API keys bill the user's default hosted workspace (their first org).
    // The hosted product provisions exactly one org per user. Decided
    // direction for multi-org: keys stay user-scoped and the org derives from
    // the project each tool call names (project-level authz) — not key→org
    // binding.
    const organizationId = await getOrCreateDefaultHostedOrganization(
      userId,
      (body) => authApi.createOrganization({ body }),
    );

    // clientId "api_key" satisfies the hosted transport's fail-closed props
    // schema and counts these calls as external MCP clients in telemetry.
    const props = createWorkersOAuthMcpProps({
      userId,
      userEmail: user.email,
      organizationId,
      baseUrl: getHostedBaseUrl(),
      scopes: [...MCP_OAUTH_SCOPES],
      clientId: "api_key",
    });

    await recordMcpAuthorized(organizationId);

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
